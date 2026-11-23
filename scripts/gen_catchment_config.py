#!/usr/bin/env python3
"""
Generate a catchment config (config/catchments/<slug>.json) from an EA WFD operational-catchment id.

This automates the one authoring judgement in national onboarding: deriving a river's WFD scope
(river water bodies + estuary) and map extent from authoritative EA data, so the per-river config is
reproducible rather than hand-guessed. See NATIONAL-ONBOARDING.md.

Scope derivation:
  * wb_ids            = the river water bodies the EA Catchment Data Explorer lists as members of the
                        operational catchment (scraped from the opcat's CDE page — this is the
                        authoritative membership. The WFD FeatureServer "contains"/"intersects"
                        spatial test is NOT used for membership: opcat and WB-catchment polygons are
                        generalised differently, so it both over- and under-includes neighbours).
  * estuary_opcat_ids = dedicated-estuary TraC opcats intersecting the river opcat (name ends
                        "Estuary", plus the named rias in RIA_NAMES). Broad coastal TraC opcats are
                        deliberately excluded — they would drag in neighbours' outlets.
  * geo.bbox/centre/radius_km = extent of the resolved river WB polygons + estuaries, with a margin.

Usage:
  gen_catchment_config.py <opcat_id> <slug> <org_uuid> [--river "River X"] [--county Devon]
                          [--company sww] [--out PATH] [--print]
Only South West Water is wired as a company preset today (the national platform's one live feed).
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

OPCAT = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDSurfaceWaterOperationalCatchmentsCycle2/FeatureServer/0/query"
WB = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query"
CDE = "https://environment.data.gov.uk/catchment-planning/OperationalCatchment/{}"

COMPANIES = {
    "sww": {
        "name": "South West Water",
        "edm_feed": "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query",
        "annual_sheet_match": "South West Water",
    },
    # National Storm Overflow Hub per-company feed (PascalCase schema; read by the generalised
    # arcgis_edm adapter — commit b6911a0). CC BY 4.0. See NATIONAL-ONBOARDING.md §8.
    "wessex": {
        "name": "Wessex Water",
        "edm_feed": "https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/Wessex_Water_Storm_Overflow_Activity/FeatureServer/0/query",
        "annual_sheet_match": "Wessex Water",
    },
}
# TraC opcats that are genuine estuaries/rias but whose name does not end in "Estuary".
RIA_NAMES = {"Carrick Roads"}


def _get(url, params=None, data=None):
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        req = urllib.request.Request(url, data=body)
    else:
        req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params or {}))
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def _poly(geom):
    return json.dumps({"rings": geom["rings"], "spatialReference": {"wkid": 4326}})


def _extent(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("opcat_id", type=int)
    ap.add_argument("slug")
    ap.add_argument("org_uuid")
    ap.add_argument("--river", default=None)
    ap.add_argument("--county", default="Devon")
    ap.add_argument("--company", default="sww", choices=list(COMPANIES))
    ap.add_argument("--out", default=None)
    ap.add_argument("--print", action="store_true", dest="to_stdout")
    a = ap.parse_args()

    # 1. river operational catchment geometry
    d = _get(OPCAT, {"where": f"opcat_id={a.opcat_id}", "outFields": "opcat_id,opcat_name",
                     "returnGeometry": "true", "outSR": "4326", "f": "json"})
    if not d.get("features"):
        sys.exit(f"opcat {a.opcat_id} not found")
    opname = d["features"][0]["attributes"]["opcat_name"]
    rgeom = d["features"][0]["geometry"]
    river = a.river or f"River {opname.split(',')[0].split(' and ')[0].strip()}"

    poly = _poly(rgeom)

    # 2. member river water bodies — authoritative list from the Catchment Data Explorer opcat page.
    with urllib.request.urlopen(CDE.format(a.opcat_id), timeout=120) as r:
        html = r.read().decode("utf-8", "replace")
    cde_ids = sorted(set(re.findall(r"WaterBody/(GB[0-9]+)", html)))
    if not cde_ids:
        sys.exit(f"no water bodies found on the CDE page for opcat {a.opcat_id}")
    # keep only ids that resolve as *river* water bodies (drops any lake/TraC ids), and get names
    wbs = {}
    for i in range(0, len(cde_ids), 50):
        chunk = cde_ids[i:i + 50]
        ids = "','".join(chunk)
        d2 = _get(WB, {"where": f"wb_id IN ('{ids}')", "outFields": "wb_id,wb_name",
                       "returnGeometry": "false", "f": "json"})
        for f in d2.get("features", []):
            wbs[f["attributes"]["wb_id"]] = f["attributes"]["wb_name"]
    dropped = [i for i in cde_ids if i not in wbs]
    if dropped:
        print(f"-- note: {len(dropped)} CDE id(s) not river WBs, dropped: {dropped}", file=sys.stderr)

    # 3. dedicated-estuary TraC opcats intersecting the river opcat (exclude broad coastal)
    est = _get(OPCAT, data={"geometry": poly, "geometryType": "esriGeometryPolygon", "inSR": "4326",
                            "spatialRel": "esriSpatialRelIntersects",
                            "where": "mncat_name='South West TraC'",
                            "outFields": "opcat_id,opcat_name", "returnGeometry": "true",
                            "outSR": "4326", "f": "json"})
    est_ids, est_rings = [], []
    for f in est.get("features", []):
        nm = f["attributes"]["opcat_name"]
        if nm.endswith("Estuary") or nm in RIA_NAMES:
            est_ids.append(int(f["attributes"]["opcat_id"]))
            est_rings.append((nm, f["geometry"].get("rings", [])))

    # 4. extent over river WBs + estuaries
    all_rings = list(rgeom["rings"])
    for _, r in est_rings:
        all_rings += r
    w, s, e, n = _extent(all_rings)
    mx = 0.012  # ~1.3 km margin
    bbox = [round(s - mx, 3), round(w - mx, 3), round(n + mx, 3), round(e + mx, 3)]
    centre = [round((s + n) / 2, 4), round((w + e) / 2, 4)]
    # rough radius for the rainfall-gauge search: half the diagonal in km
    import math
    diag_km = math.hypot((n - s) * 111, (e - w) * 111 * math.cos(math.radians(centre[0])))
    radius_km = max(10, int(round(diag_km / 2)) + 2)

    co = COMPANIES[a.company]
    cfg = {
        "name": a.slug,
        "river": river,
        "org_id": a.org_uuid,
        "county": a.county,
        "company": {"name": co["name"], "edm_feed": co["edm_feed"],
                    "annual_sheet_match": co["annual_sheet_match"]},
        "wfd": {
            "wb_ids": sorted(wbs),
            # list form (unioned by the importer); single-id configs still read estuary_opcat_id
            "estuary_opcat_ids": sorted(est_ids),
            "buffer_m": 150,
        },
        "geo": {"bbox": bbox, "centre": centre, "radius_km": radius_km},
        "edm_years": [2021, 2022, 2023, 2024],
        "provenance": (f"{river} import: EDM + WFD C2 — {len(wbs)} river WBs contained in "
                       f"operational catchment opcat {a.opcat_id} ({opname}); estuaries "
                       + (", ".join(f"{nm} ({i})" for (nm, _), i in zip(est_rings, est_ids)) or "none")
                       + "; auto-derived by gen_catchment_config.py"),
    }
    # keep the single-id field populated for back-compat when there is exactly one estuary
    if len(est_ids) == 1:
        cfg["wfd"]["estuary_opcat_id"] = est_ids[0]

    txt = json.dumps(cfg, indent=2)
    if a.to_stdout:
        print(txt)
    else:
        out = a.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                                    "config", "catchments", f"{a.slug}.json")
        with open(out, "w") as fh:
            fh.write(txt + "\n")
        print(f"wrote {out}", file=sys.stderr)
    print(f"-- {a.slug}: {len(wbs)} river WBs, estuaries {est_ids or 'none'}, bbox {bbox}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
