#!/usr/bin/env python3
"""
Code Welsh overflows to a community and a WFD water body (step `assign` for "nation": "wales").
Community: the Welsh community (parishes, ons_code W04…) containing the outlet. Water body: the NRW
Cycle 3 river water body catchment containing it (DataMapWales, OGL v3), or the nearest within 1 km for
outlets on the coast or just outside. Mirrors assign_asset_water_bodies.py for England.
  python3 scripts/assign_wales_assets.py --config config/catchments/teifi.json > /tmp/assign.sql
"""
import sys

import catchment_config
import wales_common as wc


def main():
    cfg = catchment_config.load()
    ids = set(cfg.get("wfd", {}).get("wb_ids") or [])
    s, w, n, e = cfg["geo"]["bbox"]
    catch = [f for f in wc.wfs("geonode:nrw_wfd_river_waterbody_catchments_c3_baseline_classification",
                               bbox=(w, s, e, n))
             if (f["properties"].get("wbid") or f["properties"].get("wb_id")) in ids]
    print(f"-- {len(catch)} of {len(ids)} NRW water body catchments found for {cfg['river']}", file=sys.stderr)
    org = wc.q(cfg["org_id"]) + "::uuid"
    out = [f"-- River Hub: community + water body coding for {cfg['river']}. Idempotent.", "begin;",
           "create temp table _wbc(wbid text, geom geometry) on commit drop;"]
    for f in catch:
        wbid = f["properties"].get("wbid") or f["properties"].get("wb_id")
        out.append(f"insert into _wbc values ({wc.q(wbid)}, {wc.geojson_sql(wc.simplify_geometry(f['geometry'], 0.0002))});")
    out.append(f"""
update sewage_assets a set parish_id = (
    select p.id from parishes p
    where p.ons_code like 'W04%' and p.boundary is not null
      and ST_Contains(p.boundary, ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326))
    limit 1)
where a.organisation_id = {org} and a.parish_id is null;

-- nearest NRW water body catchment within 1 km (a correlated subquery: UPDATE can't join LATERAL to its own row)
update sewage_assets a set water_body_id = (
  select wb.id from _wbc c
  join water_bodies wb on wb.organisation_id = {org} and wb.ea_water_body_id = c.wbid
  where ST_DWithin(c.geom::geography, ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography, 1000)
  order by ST_Distance(c.geom::geography, ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography)
  limit 1)
where a.organisation_id = {org};

select 'assets coded: ' || count(*) filter (where parish_id is not null) || ' community, '
       || count(*) filter (where water_body_id is not null) || ' water body, of ' || count(*)
from sewage_assets where organisation_id = {org};
commit;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
