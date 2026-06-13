#!/usr/bin/env python3
"""
Backfill historical EDM annual spill stats from the EA's all-years, geocoded Storm-Overflow
Annual Returns FeatureServer (federation; supersedes import_annual_stats.py — see ../EDM-DATA-SOURCING.md).

One query per catchment (bbox + water company, paginated) returns every outlet x year, already
geocoded, with pre-computed numeric spill count / duration / % operational and EA permit + unique
id join keys. Rows are matched to our sewage_assets by unique id (then a spatial nearest-outlet
fallback, since both sources are geocoded) and written to edm_annual_stats. Only the years the feed
provides are replaced, so other-source years (e.g. a separately-backfilled 2020) are preserved.

Config-driven (org, water company, bbox). Idempotent. Service URL is pinned here but overridable
via EDM_FS_URL in case the EA relocates the hosted layer.

Usage:
    python3 import_edm.py [--config config/catchments/<x>.json] > /tmp/edm.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/edm.sql
"""
import json, os, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
FS = os.environ.get(
    "EDM_FS_URL",
    "https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/edm_annual_returns_all_years_public/FeatureServer/0",
)
MATCH_DIST_M = 150  # spatial fallback: nearest asset within this many metres of the EDM outlet

OUT_FIELDS = ",".join([
    "annual_return_year", "unique_id", "old_unique_id_pre_2024", "permit_reference_ea_condat",
    "activity_reference_on_permit", "site_name_wasc_op_name", "site_name_ea_condat",
    "counted_spills_12_24hr_calculated", "total_spill_duration_hrs_calculated",
    "edm_operation_percent_calculated",
])


def get(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=120, context=_SSL) as r:
        return json.load(r)


def fetch(cfg):
    # Filter by water company only — NOT bbox. Assets are clipped to the catchment polygon, which
    # can extend past the rectangular bbox (e.g. Princetown on the West Dart sits west of the Dart
    # bbox edge); the asset-match step below scopes results to our catchment, so a bbox here would
    # wrongly drop edge outlets. The whole-company set is a handful of paginated pages.
    company = cfg["company"]["name"]
    feats, offset = [], 0
    while True:
        page = get(f"{FS}/query", {
            "where": f"water_company_name = '{company}' and has_data = 1",
            "outFields": OUT_FIELDS, "returnGeometry": "true", "outSR": 4326,
            "resultOffset": offset, "resultRecordCount": 1000, "f": "json",
        })
        batch = page.get("features", [])
        feats += batch
        if len(batch) < 1000:
            return feats
        offset += len(batch)


def numlit(v):
    if v in (None, ""):
        return "null"
    try:
        return repr(round(float(v), 2))
    except (TypeError, ValueError):
        return "null"


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    feats = fetch(cfg)
    print(f"-- {len(feats)} EDM annual-return rows for {cfg['company']['name']} in {cfg['river']} bbox", file=sys.stderr)

    rows, years = [], set()
    for f in feats:
        a = f["attributes"]; g = f.get("geometry") or {}
        try:
            yr = int(str(a.get("annual_return_year")).strip())
        except (TypeError, ValueError):
            continue
        uid = (a.get("unique_id") or "").strip() or None
        ouid = (a.get("old_unique_id_pre_2024") or "").strip() or None
        permit = (a.get("permit_reference_ea_condat") or "").strip() or None
        act = (a.get("activity_reference_on_permit") or "").strip() or None
        # stable per-outlet id: unique id, else old id, else permit(+activity ref)
        outlet_id = uid or ouid or (f"{permit}:{act}" if permit else None)
        if outlet_id is None or g.get("x") is None:
            continue
        site = (a.get("site_name_wasc_op_name") or a.get("site_name_ea_condat") or "").strip() or None
        rows.append({
            "outlet_id": outlet_id, "year": yr,
            "cnt": a.get("counted_spills_12_24hr_calculated"),
            "dur": a.get("total_spill_duration_hrs_calculated"),
            "pct": a.get("edm_operation_percent_calculated"),
            "site": site, "lon": g["x"], "lat": g["y"], "uid": uid, "ouid": ouid,
        })
        years.add(yr)

    if not rows:
        sys.exit("no EDM rows returned — check the catchment bbox / water company name")

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: EDM annual stats for {cfg['river']} from the EA all-years FeatureServer. Idempotent.",
           "begin;",
           "create temp table _edm(outlet_id text, year int, spill_count numeric, dur numeric, pct numeric, "
           "site text, lon float, lat float, uid text, ouid text) on commit drop;"]
    for r in rows:
        out.append(
            "insert into _edm values ("
            f"{q(r['outlet_id'])},{r['year']},{numlit(r['cnt'])},{numlit(r['dur'])},{numlit(r['pct'])},"
            f"{q(r['site'])},{r['lon']},{r['lat']},{q(r['uid'])},{q(r['ouid'])});"
        )
    # match each EDM outlet to one of our assets: exact unique-id, else nearest within MATCH_DIST_M
    out.append(f"""create temp table _matched on commit drop as
select e.*, (
  select sa.id from sewage_assets sa
  where sa.organisation_id = {orgl} and sa.latitude is not null and sa.longitude is not null
    and ( (e.uid is not null and sa.asset_unique_id = e.uid)
       or (e.ouid is not null and sa.asset_unique_id = e.ouid)
       or ST_DWithin(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude),4326)::geography,
                     ST_SetSRID(ST_MakePoint(e.lon, e.lat),4326)::geography, {MATCH_DIST_M}) )
  order by (case when sa.asset_unique_id in (coalesce(e.uid,'~'), coalesce(e.ouid,'~')) then 0 else 1 end),
           ST_Distance(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude),4326)::geography,
                       ST_SetSRID(ST_MakePoint(e.lon, e.lat),4326)::geography)
  limit 1
) asset_id
from _edm e;""")
    # replace only the years this feed covers (preserves e.g. a separately-backfilled 2020)
    yrs = ",".join(str(y) for y in sorted(years))
    out.append(f"delete from edm_annual_stats where organisation_id = {orgl} and year in ({yrs});")
    out.append(f"""insert into edm_annual_stats
    (organisation_id, asset_id, outlet_id, year, spill_count, total_duration_hours, reporting_pct, site_name, source)
  select distinct on (outlet_id, year)
         {orgl}, asset_id, outlet_id, year, spill_count, dur, pct, site, 'ea-edm-fs'
  from _matched where asset_id is not null
  order by outlet_id, year, spill_count desc nulls last
  on conflict (organisation_id, outlet_id, year) do update set
     asset_id = excluded.asset_id, spill_count = excluded.spill_count,
     total_duration_hours = excluded.total_duration_hours, reporting_pct = excluded.reporting_pct,
     site_name = excluded.site_name, source = excluded.source;""")
    out.append(f"select 'matched EDM rows: ' || count(*) filter (where asset_id is not null) || ' of ' || count(*) from _matched;")
    out.append(f"select 'edm_annual_stats now: ' || count(*) from edm_annual_stats where organisation_id = {orgl};")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
