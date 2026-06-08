#!/usr/bin/env python3
"""
Assign each sewage asset its WFD water body by point-in-polygon against the EA
WFD river water-body catchments (with nearest-polygon fallback for estuary/edge
outlets). Matches polygons to the water_bodies taxonomy via the EA WFD ID
(water_bodies.ea_water_body_id), so it's portable across local + prod.

Usage:
  python3 assign_asset_water_bodies.py > /tmp/wb_assign.sql
  docker exec -i supabase_db_river-hub psql -U postgres -d postgres < /tmp/wb_assign.sql   # local
  docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/wb_assign.sql                       # prod
"""
import json, ssl, urllib.parse, urllib.request

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
ORG = "00000000-0000-0000-0000-000000000001"
WB_SERVICE = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query"
WB_IDS = [
    "GB108046008350", "GB108046005060", "GB108046008420", "GB108046008400",
    "GB108046008340", "GB108046008361", "GB108046005240", "GB108046008370",
    "GB108046008380", "GB108046008390", "GB108046008410", "GB108046005250",
    "GB108046005220", "GB108046005190", "GB108046005270", "GB108046005160",
    "GB108046005230", "GB108046005430", "GB108046005170", "GB108046005080",
]


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
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
    print("commit;")


if __name__ == "__main__":
    main()
