#!/usr/bin/env python3
"""
Assign each sewage asset its **parish** and **WFD water body** by location (federation F3/F6).

Both are post-asset-load spatial updates the pipeline must run after import_catchment:
- water body: point-in-polygon against the EA WFD river water-body catchments (nearest-polygon
  fallback for estuary/edge outlets), matched to the water_bodies taxonomy via ea_water_body_id
  (so import_water_bodies.py must have run first).
- parish: point-in-polygon against the loaded parish boundaries, <=2 km nearest-parish fallback
  for estuary/foreshore outlets (generalises migration 0017, which only ran at migration time,
  before any assets existed).

Catchment-specific values (org, wb_ids) come from the config. Idempotent.

Usage:
  python3 assign_asset_water_bodies.py [--config config/catchments/<x>.json] > /tmp/assign.sql
  docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/assign.sql
"""
import json, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
WB_SERVICE = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query"

_CC = catchment_config.load()
ORG = _CC["org_id"]
WB_IDS = _CC.get("wfd", {}).get("wb_ids", [])


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    if not WB_IDS:
        sys.exit("catchment config has no wfd.wb_ids")
    where = "wb_id IN ('" + "','".join(WB_IDS) + "')"
    params = urllib.parse.urlencode({"where": where, "outFields": "wb_id", "outSR": 4326, "f": "geojson"})
    with urllib.request.urlopen(f"{WB_SERVICE}?{params}", timeout=90, context=_SSL) as r:
        fc = json.load(r)
    feats = fc.get("features", [])
    print(f"-- {len(feats)} WFD water-body polygons fetched")

    org = q(ORG) + "::uuid"
    print("begin;")
    print("create temp table _wb(wb_id text, geom geometry) on commit drop;")
    for f in feats:
        wb_id = f["properties"]["wb_id"]
        geom = json.dumps(f["geometry"]).replace("'", "''")
        print(f"insert into _wb values ({q(wb_id)}, st_setsrid(st_geomfromgeojson('{geom}'),4326));")

    # contains-first, else nearest polygon; match to taxonomy via ea_water_body_id.
    # correlated scalar subquery (UPDATE ... FROM lateral can't reference the target).
    print(f"""update sewage_assets a set water_body_id = (
    select wb.id
    from _wb w
    join water_bodies wb on wb.organisation_id = {org} and wb.ea_water_body_id = w.wb_id
    order by st_contains(w.geom, st_setsrid(st_makepoint(a.longitude, a.latitude),4326)) desc,
             st_distance(w.geom::geography, st_setsrid(st_makepoint(a.longitude, a.latitude),4326)::geography) asc
    limit 1
  )
  where a.organisation_id = {org} and a.latitude is not null and a.longitude is not null;""")

    print("select 'assets with a water body: ' || count(*) from sewage_assets where water_body_id is not null and organisation_id = " + org + ";")

    # ---- parish assignment (generalises migration 0017; runs now that assets exist) ----
    print(f"""update sewage_assets a set parish_id = p.id
  from parishes p
  where a.organisation_id = {org} and a.parish_id is null
    and a.latitude is not null and a.longitude is not null and p.boundary is not null
    and ST_Contains(p.boundary, ST_SetSRID(ST_Point(a.longitude, a.latitude), 4326));""")
    print(f"""update sewage_assets a set parish_id = nn.pid
  from (
    select a2.id sid,
      (select p.id from parishes p where p.boundary is not null
         order by p.boundary <-> ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326) limit 1) pid,
      (select ST_Distance(p.boundary::geography, ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326)::geography)
         from parishes p where p.boundary is not null
         order by p.boundary <-> ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326) limit 1) dist
    from sewage_assets a2
    where a2.organisation_id = {org} and a2.parish_id is null
      and a2.latitude is not null and a2.longitude is not null
  ) nn
  where a.id = nn.sid and nn.dist < 2000;""")
    print("select 'assets with a parish: ' || count(*) from sewage_assets where parish_id is not null and organisation_id = " + org + ";")
    print("commit;")


if __name__ == "__main__":
    main()
