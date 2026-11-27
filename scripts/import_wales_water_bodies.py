#!/usr/bin/env python3
"""
Welsh WFD river water bodies (step `water-bodies` for "nation": "wales"; WALES-ROLLOUT-PLAN.md §5).
The config's wfd.wb_ids (NRW Cycle 3, same GB… ids as the EA's) with their names from DataMapWales,
written to water_bodies like import_water_bodies.py does for England.
  python3 scripts/import_wales_water_bodies.py --config config/catchments/teifi.json > /tmp/wb.sql
"""
import sys

import catchment_config
import wales_common as wc


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    ids = set(cfg.get("wfd", {}).get("wb_ids") or [])
    if not ids:
        sys.exit("catchment config has no wfd.wb_ids")
    rows = {f["properties"]["wbid"]: f["properties"]["wb_name"]
            for f in wc.wfs("geonode:nrw_wfd_river_waterbodies_c3_baseline_classification", props=["wbid", "wb_name"])
            if f["properties"]["wbid"] in ids}
    print(f"-- {len(rows)} of {len(ids)} NRW water bodies resolved for {cfg['river']}", file=sys.stderr)
    out = [f"-- River Hub: WFD water bodies for {cfg['river']} ({wc.NRW_ATTRIBUTION}; OGL v3). Idempotent.", "begin;"]
    for wb_id, name in sorted(rows.items()):
        out.append("insert into water_bodies (organisation_id, code, label, ea_water_body_id)\n"
                   f"select {wc.q(org)}, {wc.q(wb_id)}, {wc.q(' '.join((name or wb_id).split()))}, {wc.q(wb_id)}\n"
                   f"where not exists (select 1 from water_bodies where organisation_id = {wc.q(org)} "
                   f"and ea_water_body_id = {wc.q(wb_id)});")
    out.append("commit;")
    out.append(f"select 'water bodies: ' || count(*) from water_bodies where organisation_id = {wc.q(org)};")
    print("\n".join(out))


if __name__ == "__main__":
    main()
