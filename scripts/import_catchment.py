#!/usr/bin/env python3
"""
Repeatable catchment-asset importer (see ../CATCHMENT-METHOD.md).

Given a per-catchment config, this:
  1. fetches the river's WFD water-body polygons + estuary polygon (EA ArcGIS),
  2. fetches the water company's live EDM outlets (the operational set the daily cron tracks),
  3. fetches type/site/permit enrichment per outlet from the EA all-years EDM FeatureServer,
     keyed by Unique ID (== the live feed's `Id`) — no manual spreadsheet (see ../EDM-DATA-SOURCING.md),
  4. emits an idempotent SQL script that, in PostGIS:
       - unions the boundary (+150 m shoreline buffer, in EPSG:27700),
       - keeps outlets inside it (point-in-polygon),
       - enriches them by exact Unique-ID join to the EDM data,
       - upserts sewage_systems (grouped by site/town token) and sewage_assets (with provenance).

Usage:
    python3 import_catchment.py [--config config/catchments/<x>.json] > /tmp/assets.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/assets.sql      # or local psql

All fetches are HTTP; geometry is done in SQL, so no Python geo/Excel deps are needed.
"""
import json, sys, ssl, urllib.parse, urllib.request, datetime

# Public open-data GET endpoints; this Python build lacks a root-cert bundle.
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

# ----------------- Per-catchment config (federation F3: config/catchments/*.json) -----------------
import os
import catchment_config

_CC = catchment_config.load()
CONFIG = {
    "river": _CC["river"],
    "org_id": _CC["org_id"],
    "owner": _CC["company"]["name"],
    "buffer_m": _CC.get("wfd", {}).get("buffer_m", 150),
    # National EA services — identical for every catchment (central connectors).
    "wb_service": "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query",
    "opcat_service": "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDSurfaceWaterOperationalCatchmentsCycle2/FeatureServer/0/query",
    "wb_ids": _CC.get("wfd", {}).get("wb_ids", []),
    "estuary_opcat_id": _CC.get("wfd", {}).get("estuary_opcat_id"),
    "feed": _CC["company"]["edm_feed"],
    "company": _CC["company"]["name"],
    # asset type/permit/site enrichment now comes from the EA all-years EDM FeatureServer
    # (was a manually-downloaded annual-return xlsx) — see ../EDM-DATA-SOURCING.md.
    "edm_fs": os.environ.get(
        "EDM_FS_URL",
        "https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/edm_annual_returns_all_years_public/FeatureServer/0/query",
    ),
    "provenance": _CC.get("provenance", f"{_CC['river']} import: EDM + WFD C2 + buffer"),
}

TYPE_MAP = {
    "SO on sewer network": "combined_sewer_overflow",
    "Storm discharge at pumping station": "pumping_station",
    "Storm discharge at pumping station - with treatment": "pumping_station",
    "Inlet SO at WwTW": "sewage_treatment_works",
    "Storm tank at WwTW": "storm_tank",
    "Storm tank at WwTW - with treatment": "storm_tank",
}


def get(url, params):
    q = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{url}?{q}", timeout=90, context=_SSL) as r:
        return json.load(r)


def fetch_boundary(cfg):
    ids = "','".join(cfg["wb_ids"])
    wb = get(cfg["wb_service"], {
        "where": f"wb_id IN ('{ids}')", "outFields": "wb_id", "outSR": 4326, "f": "geojson"})
    est = get(cfg["opcat_service"], {
        "where": f"opcat_id={cfg['estuary_opcat_id']}", "outFields": "opcat_id",
        "outSR": 4326, "f": "geojson"})
    geoms = [f["geometry"] for f in wb["features"]] + [f["geometry"] for f in est["features"]]
    return geoms


def fetch_outlets(cfg):
    d = get(cfg["feed"], {
        "where": "1=1",
        "outFields": "Id,receivingWaterCourse,status,longitude,latitude",
        "returnGeometry": "false", "f": "json"})
    out = []
    for f in d["features"]:
        a = f["attributes"]
        if a.get("longitude") is None or a.get("latitude") is None:
            continue
        out.append((a["Id"], a.get("receivingWaterCourse"), a.get("status"),
                    a["longitude"], a["latitude"]))
    return out


def read_annual(cfg):
    """Asset type/permit/site enrichment per outlet, keyed by Unique ID (== the live feed's `Id`),
    from the EA all-years EDM FeatureServer. Keeps the latest annual-return year per outlet so the
    Unique ID matches the live feed. Replaces the old manual annual-return spreadsheet."""
    company = cfg["company"]
    best = {}   # uid -> (year, row)
    offset = 0
    while True:
        d = get(cfg["edm_fs"], {
            "where": f"water_company_name = '{company}'",
            "outFields": "unique_id,annual_return_year,storm_discharge_asset_type,"
                         "site_name_wasc_op_name,permit_reference_ea_condat",
            "returnGeometry": "false", "resultOffset": offset, "resultRecordCount": 1000, "f": "json"})
        feats = d.get("features", [])
        for f in feats:
            a = f["attributes"]
            uid = (a.get("unique_id") or "").strip()
            if not uid:
                continue
            try:
                yr = int(str(a.get("annual_return_year")).strip())
            except (TypeError, ValueError):
                yr = 0
            if uid in best and best[uid][0] >= yr:
                continue
            site = (a.get("site_name_wasc_op_name") or "").strip()
            permit = (a.get("permit_reference_ea_condat") or "").strip()
            permit = None if permit in ("", "#TBC") else permit
            town = site.rsplit("_", 1)[-1].strip() if "_" in site else None
            best[uid] = (yr, {"type": TYPE_MAP.get((a.get("storm_discharge_asset_type") or "").strip()),
                              "site": site or None, "town": town, "permit": permit})
        if len(feats) < 1000:
            break
        offset += len(feats)
    print(f"-- EDM enrichment: {len(best)} outlets for {company}", file=sys.stderr)
    return {uid: v[1] for uid, v in best.items()}


def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    cfg = CONFIG
    geoms = fetch_boundary(cfg)
    outlets = fetch_outlets(cfg)
    annual = read_annual(cfg)
    today = datetime.date.today().isoformat()
    prov = f"{cfg['provenance']} ({today})"

    P = print
    P("-- AUTO-GENERATED by import_catchment.py — idempotent. River: " + cfg["river"])
    P("begin;")
    P("create temp table _cat(geom geometry) on commit drop;")
    for g in geoms:
        P(f"insert into _cat values (st_setsrid(st_geomfromgeojson({q(json.dumps(g))}),4326));")
    P("create temp table _outlet(id text, rwc text, status int, lon float, lat float, geom geometry) on commit drop;")
    for (oid, rwc, st, lon, lat) in outlets:
        st = "null" if st is None else int(st)
        P(f"insert into _outlet values ({q(oid)},{q(rwc)},{st},{lon},{lat},st_setsrid(st_makepoint({lon},{lat}),4326));")
    P("create temp table _ar(id text primary key, asset_type text, site text, town text, permit text) on commit drop;")
    for uid, a in annual.items():
        P(f"insert into _ar values ({q(uid)},{q(a['type'])},{q(a['site'])},{q(a['town'])},{q(a['permit'])});")

    # in-catchment outlets (union + buffer in BNG)
    P(f"""create temp table _incat on commit drop as
  select o.*, a.asset_type, a.site, a.town, a.permit
  from _outlet o
  join (select st_buffer(st_transform(st_union(geom),27700),{cfg['buffer_m']}) g from _cat) c
       on st_contains(c.g, st_transform(o.geom,27700))
  left join _ar a on a.id = o.id;""")

    org = q(cfg["org_id"]) + "::uuid"
    # systems: one per distinct town token present in-catchment
    P(f"""insert into sewage_systems (organisation_id, name, description)
  select distinct {org}, town || ' system', {q(prov)}
  from _incat where town is not null
    and not exists (select 1 from sewage_systems s where s.organisation_id={org} and s.name = _incat.town || ' system');""")

    # assets: upsert by (organisation_id, asset_unique_id)
    P(f"""insert into sewage_assets
    (organisation_id, asset_name, asset_unique_id, asset_type, asset_owner,
     latitude, longitude, edm_enabled, sewage_system_id, notes)
  select {org},
         coalesce(i.site, i.id),
         i.id,
         i.asset_type::asset_type,
         {q(cfg['owner'])},
         i.lat, i.lon, true,
         (select s.id from sewage_systems s where s.organisation_id={org} and s.name = i.town || ' system'),
         {q(prov)}
  from _incat i
  on conflict (organisation_id, asset_unique_id) do update set
     asset_name = excluded.asset_name,
     asset_type = excluded.asset_type,
     latitude = excluded.latitude,
     longitude = excluded.longitude,
     sewage_system_id = excluded.sewage_system_id,
     notes = excluded.notes;""")

    P("""select 'imported assets: ' || count(*) from _incat;""")
    P("commit;")


if __name__ == "__main__":
    main()
