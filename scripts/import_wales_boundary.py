#!/usr/bin/env python3
"""
Welsh catchment outline (step `boundary` for "nation": "wales"; WALES-ROLLOUT-PLAN.md §5).
The union of the config's NRW WFD Cycle 3 operational catchments (DataMapWales, OGL v3), simplified to
about 20 m, written to catchment_boundaries like import_catchment_boundary.py does for England.
  python3 scripts/import_wales_boundary.py --config config/catchments/teifi.json > /tmp/boundary.sql
"""
import sys

import catchment_config
import wales_common as wc


def main():
    cfg = catchment_config.load()
    names = set(cfg["nrw"]["opcats"])
    polys = [f["geometry"] for f in wc.wfs("geonode:nrw_wfd_operational_catchments_c3")
             if f["properties"]["op_catch"] in names]
    if not polys:
        sys.exit(f"no NRW operational catchments named {sorted(names)}")
    geoms = [wc.simplify_geometry(g, tol=0.0002) for g in polys]
    print(f"-- {cfg['river']}: {len(polys)} NRW catchment polygons", file=sys.stderr)
    org = wc.q(cfg["org_id"]) + "::uuid"
    parts = ",\n  ".join(wc.geojson_sql(g) for g in geoms)
    src = f"NRW WFD Cycle 3 operational catchments: {', '.join(sorted(names))}"
    print(f"""-- River Hub: catchment outline for {cfg['river']} ({wc.NRW_ATTRIBUTION}; OGL v3). Idempotent.
begin;
insert into catchment_boundaries (organisation_id, geom, source, updated_at)
select {org},
  ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(array[
  {parts}
  ]))), 3)),
  {wc.q(src)}, now()
on conflict (organisation_id) do update set geom = excluded.geom, source = excluded.source, updated_at = now();
select 'catchment outline: ' || round((ST_Area(geom::geography) / 1e6)::numeric, 1) || ' km2'
  from catchment_boundaries where organisation_id = {org};
commit;""")


if __name__ == "__main__":
    main()
