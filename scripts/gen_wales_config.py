#!/usr/bin/env python3
"""
Write the catchment config for a Welsh river (WALES-ROLLOUT-PLAN.md §5), the Welsh counterpart of
gen_catchment_config.py. A Welsh river is one or more NRW WFD Cycle 3 operational catchments (by name,
from DataMapWales); its river water bodies are the Cycle 3 water bodies in those catchments.

  python3 scripts/gen_wales_config.py --opcat Teifi --slug teifi --name "River Teifi" --name-cy "Afon Teifi"

Writes config/catchments/<slug>.json (refuses to overwrite unless --force, so an org_id is never lost).
"""
import argparse
import json
import math
import os
import sys
import uuid
from collections import Counter

import wales_common as wc

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.join(HERE, "..", "config", "catchments")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--opcat", action="append", required=True, help="NRW operational catchment name (repeatable)")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--name", required=True, help='English name, e.g. "River Teifi"')
    ap.add_argument("--name-cy", help='Welsh name, e.g. "Afon Teifi"')
    ap.add_argument("--buffer-m", type=int, default=150, help="outlets within this distance of the outline count")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    path = os.path.join(CONFIG_DIR, f"{a.slug}.json")
    old = json.load(open(path)) if os.path.exists(path) else None
    if old and not a.force:
        sys.exit(f"{path} exists; use --force to rewrite it (its org_id is kept)")

    names = set(a.opcat)
    opcats = [f for f in wc.wfs("geonode:nrw_wfd_operational_catchments_c3")
              if f["properties"]["op_catch"] in names]
    found = {f["properties"]["op_catch"] for f in opcats}
    if found != names:
        sys.exit(f"operational catchments not found: {sorted(names - found)}")
    wbs = [f["properties"] for f in wc.wfs("geonode:nrw_wfd_river_waterbodies_c3_baseline_classification",
                                           props=["wbid", "wb_name", "op_catch", "man_catch", "rbd"])
           if f["properties"]["op_catch"] in names]

    w, s, e, n = wc.bounds([f["geometry"] for f in opcats])
    pad = 0.01
    bbox = [round(s - pad, 3), round(w - pad, 3), round(n + pad, 3), round(e + pad, 3)]   # [S, W, N, E]
    centre = [round((s + n) / 2, 4), round((w + e) / 2, 4)]
    radius_km = math.ceil(max(wc.metres((w, s), (e, n)) / 2000, 5))
    councils = wc.wfs("geonode:community_and_town_councils", props=["la_en"],
                      bbox=(centre[1] - 0.02, centre[0] - 0.02, centre[1] + 0.02, centre[0] + 0.02))
    county = Counter((c["properties"]["la_en"] or "").title() for c in councils).most_common(1)
    rbd = Counter(wb["rbd"] for wb in wbs).most_common(1)

    cfg = {
        "name": a.slug,
        "river": a.name,
        "river_name_cy": a.name_cy,
        "org_id": (old or {}).get("org_id") or str(uuid.uuid4()),
        "nation": "wales",
        "county": county[0][0] if county else None,
        "company": {"name": wc.DCWW_NAME, "edm_feed": wc.DCWW_LIVE, "annual_sheet_match": "Dwr Cymru Welsh Water",
                    "wwca_key": "welsh_water"},   # the wastewater catchment areas release's company key
        "nrw": {"opcats": sorted(names), "man_catch": wbs[0]["man_catch"] if wbs else None,
                "rbd": rbd[0][0] if rbd else None},
        "wfd": {"wb_ids": sorted(wb["wbid"] for wb in wbs), "buffer_m": a.buffer_m},
        "geo": {"bbox": bbox, "centre": centre, "radius_km": radius_km},
        "edm_years": [2022, 2023, 2024, 2025],
        "provenance": f"{a.name} import: NRW WFD Cycle 3 operational catchment(s) {', '.join(sorted(names))} "
                      f"({len(wbs)} river water bodies); Dŵr Cymru live feed and annual EDM returns",
    }
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {os.path.relpath(path)}: {len(opcats)} catchment polygons, {len(wbs)} water bodies, "
          f"county {cfg['county']}, bbox {bbox}", file=sys.stderr)


if __name__ == "__main__":
    main()
