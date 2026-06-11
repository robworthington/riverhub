#!/usr/bin/env python3
"""
Load civil-parish boundaries for a catchment (federation F3 — generalises the ad-hoc M3b load).

Fetches ONS parish boundaries (May 2023, BGC) intersecting the catchment bbox, plus Local
Authority District boundaries for the same area, and emits idempotent SQL that:
  1. updates existing parishes matched by ons_code (refresh boundary),
  2. updates existing parishes matched by name+county that lack a boundary (sets ons_code too),
  3. inserts any remaining parishes, with district = LAD containing the parish's point-on-surface
     and county from the catchment config.
Population is NOT set here — run estimate_system_population.py afterwards.

Usage:
    python3 import_parishes.py [--config config/catchments/<x>.json] > /tmp/parishes.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/parishes.sql
"""
import json, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE

# National ONS Open Geography services (central connectors — same for every catchment).
PARISH_SERVICE = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
                  "Parishes_May_2023_Boundaries_EW_BGC/FeatureServer/0/query")
LAD_SERVICE = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
               "Local_Authority_Districts_May_2023_UK_BGC_V2/FeatureServer/0/query")


def fetch_features(service, envelope, out_fields):
    """Paginated ArcGIS geojson query by bbox envelope; returns list of features."""
    feats, offset = [], 0
    xmin, ymin, xmax, ymax = envelope
    while True:
        params = urllib.parse.urlencode({
            "geometry": f"{xmin},{ymin},{xmax},{ymax}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields, "returnGeometry": "true",
            "outSR": 4326, "f": "geojson",
            "resultOffset": offset, "resultRecordCount": 100,
        })
        with urllib.request.urlopen(f"{service}?{params}", timeout=180, context=_SSL) as r:
            page = json.load(r)
        batch = page.get("features", [])
        feats += batch
        if len(batch) < 100:
            return feats
        offset += len(batch)


def lit(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def main():
    cfg = catchment_config.load()
    county = cfg.get("county") or cfg["river"]
    env = catchment_config.bbox_envelope(cfg)

    parishes = fetch_features(PARISH_SERVICE, env, "PAR23CD,PAR23NM")
    lads = fetch_features(LAD_SERVICE, env, "LAD23NM")
    print(f"-- fetched {len(parishes)} parishes, {len(lads)} districts for bbox {env}", file=sys.stderr)
    if not parishes:
        sys.exit("no parishes returned — check the bbox in the catchment config")

    out = [
        f"-- River Hub: parish boundaries for {cfg['river']} ({len(parishes)} parishes, {len(lads)} LADs). Idempotent.",
        "begin;",
        "create temp table ons_par (code text primary key, name text, gj text) on commit drop;",
        "create temp table ons_lad (name text, gj text) on commit drop;",
    ]
    for f in parishes:
        p = f["properties"]
        out.append(f"insert into ons_par values ({lit(p['PAR23CD'])}, {lit(p['PAR23NM'])}, {lit(json.dumps(f['geometry']))}) on conflict do nothing;")
    for f in lads:
        out.append(f"insert into ons_lad values ({lit(f['properties']['LAD23NM'])}, {lit(json.dumps(f['geometry']))});")

    out.append(f"""
-- geometry + district lookup
create temp table ons_par_g on commit drop as
  select code, name, ST_Multi(ST_MakeValid(ST_GeomFromGeoJSON(gj)))::geometry(MultiPolygon,4326) geom from ons_par;
create temp table ons_lad_g on commit drop as
  select name, ST_MakeValid(ST_GeomFromGeoJSON(gj)) geom from ons_lad;
create temp table par_district on commit drop as
  select p.code, p.name, p.geom,
    (select l.name from ons_lad_g l where ST_Contains(l.geom, ST_PointOnSurface(p.geom)) limit 1) district
  from ons_par_g p;

-- 1. refresh by ons_code
update parishes t set boundary = s.geom
from par_district s where t.ons_code = s.code;

-- 2. existing rows (e.g. name-seeded) without a boundary: match by name + county
update parishes t set ons_code = s.code, boundary = s.geom
from par_district s
where t.ons_code is null and t.boundary is null
  and lower(t.name) = lower(s.name) and t.county = {lit(county)};

-- 3. brand-new parishes (district from containing LAD)
insert into parishes (name, district, county, ons_code, boundary)
select s.name, s.district, {lit(county)}, s.code, s.geom
from par_district s
where s.district is not null
  and not exists (select 1 from parishes t where t.ons_code = s.code)
  and not exists (select 1 from parishes t where lower(t.name) = lower(s.name) and t.district = s.district)
on conflict (name, district) do update set ons_code = excluded.ons_code, boundary = excluded.boundary;

commit;
select count(*) as parishes_with_boundary from parishes where boundary is not null;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
