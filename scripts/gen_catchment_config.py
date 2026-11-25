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
  gen_catchment_config.py <opcat_id>[,<opcat_id>…] <slug> <org_uuid> [--river "River X"] [--county Devon]
                          [--company sww] [--coastal] [--out PATH] [--print]

Several opcat ids (comma-separated) make one river from several EA catchments, e.g. Upper, Middle and
Lower Medway plus the Beult, Teise and Eden: water bodies, estuaries and extent are unioned.
--coastal makes a coastal stretch from coastal/estuary (TraC) opcats instead: no river water bodies,
the opcats themselves are the outline, and outlets a river page already has are left to it.
Company presets live in COMPANIES; add one per water company as it is onboarded (ENGLAND-ROLLOUT-PLAN.md).
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
    "southern": {
        "name": "Southern Water",
        "edm_feed": "https://services-eu1.arcgis.com/6qJmARkS2dt2IjVA/arcgis/rest/services/SouthernWater_StormOverflowActivity_PROD_view/FeatureServer/0/query",
        "annual_sheet_match": "Southern Water",
    },
}
# TraC opcats that are genuine estuaries/rias but whose name does not end in "Estuary".
RIA_NAMES = {"Carrick Roads"}
# Other dedicated estuaries with plain names (checked against the EA opcat list, Nov 2026).
ESTUARY_NAMES = RIA_NAMES | {"Tidal Thames", "Southampton Water", "Lower Adur", "Lower Cuckmere", "Lower Ouse",
                             "Lymington Beaulieu Estuaries", "Severn Lower", "Wash Inner", "Great Ouse"}
# "<X> TraC" opcats are a river's estuary ("Parrett TraC", "Esk TraC", "Tyne Lower and Estuary TraC")
# except these county/sea coastlines, which would drag in neighbours' outlets.
COASTAL_TRAC = {"Essex TraC", "Lincolnshire TraC", "Norfolk East TraC", "Norfolk North TraC", "Suffolk TraC",
                "The Wash TraC"}


def is_estuary(name):
    """A dedicated estuary/ria TraC opcat (not a broad coastal water)."""
    return (name.endswith("Estuary") or name in ESTUARY_NAMES
            or (name.endswith(" TraC") and name not in COASTAL_TRAC))


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


# same ONS service import_parishes.py uses
LAD = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
       "Local_Authority_Districts_May_2023_UK_BGC_V2/FeatureServer/0/query")


def _local_authority(centre):
    """ONS local authority name at a [lat, lng] point, or None if the lookup fails."""
    try:
        d = _get(LAD, {"geometry": f"{centre[1]},{centre[0]}", "geometryType": "esriGeometryPoint",
                       "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
                       "outFields": "LAD23NM", "returnGeometry": "false", "f": "json"})
        feats = d.get("features") or []
        return feats[0]["attributes"]["LAD23NM"] if feats else None
    except Exception:
        return None


def _inside(pt, rings):
    """Even-odd point-in-polygon over ESRI rings (holes cancel out), pt = (x, y)."""
    x, y, hit = pt[0], pt[1], False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
    return hit


def _majority_authority(rgeom, grid=24):
    """The local authority covering most of the river's own catchment (estuaries left out), English
    authorities first. A bbox-centre lookup lands in the sea for coastal catchments and in Wales for
    ones along the Severn; sampling a grid inside the catchment avoids both. None if it fails."""
    try:
        d = _get(LAD, data={"geometry": _poly(rgeom), "geometryType": "esriGeometryPolygon", "inSR": "4326",
                            "spatialRel": "esriSpatialRelIntersects", "outFields": "LAD23CD,LAD23NM",
                            "returnGeometry": "true", "outSR": "4326", "f": "json"})
        lads = [(f["attributes"]["LAD23CD"], f["attributes"]["LAD23NM"], f["geometry"]["rings"])
                for f in d.get("features") or []]
        if not lads:
            return None
        w, s, e, n = _extent(rgeom["rings"])
        counts = {}
        for i in range(grid):
            for j in range(grid):
                pt = (w + (i + 0.5) * (e - w) / grid, s + (j + 0.5) * (n - s) / grid)
                if not _inside(pt, rgeom["rings"]):
                    continue
                for code, name, rings in lads:
                    if _inside(pt, rings):
                        counts[(code, name)] = counts.get((code, name), 0) + 1
                        break
        if not counts:
            return None
        english = {k: v for k, v in counts.items() if k[0].startswith("E")} or counts
        return max(english, key=english.get)[1]
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("opcat_id", help="opcat id, or several comma-separated for one river")
    ap.add_argument("slug")
    ap.add_argument("org_uuid")
    ap.add_argument("--river", default=None)
    # Label for the river's parishes. Default: the English local authority covering most of the river's
    # catchment (ONS), so a river outside Devon isn't labelled Devon.
    ap.add_argument("--county", default=None)
    ap.add_argument("--company", default="sww", choices=list(COMPANIES))
    # a catchment served by a second company (e.g. on the Welsh border): repeat for each extra one
    ap.add_argument("--extra-company", action="append", default=[], choices=list(COMPANIES), dest="extra_companies")
    ap.add_argument("--coastal", action="store_true",
                    help="the opcats are coastal TraC opcats: a coastal stretch, no river water bodies")
    ap.add_argument("--skip-estuary", action="append", type=int, default=[], dest="skip_estuaries",
                    help="estuary opcat id to leave out (it belongs to another river), repeatable")
    ap.add_argument("--out", default=None)
    ap.add_argument("--print", action="store_true", dest="to_stdout")
    a = ap.parse_args()

    opcat_ids = [int(x) for x in str(a.opcat_id).split(",") if x.strip()]
    # 1. operational catchment geometry (one or several)
    ops = []
    for oid in opcat_ids:
        d = _get(OPCAT, {"where": f"opcat_id={oid}", "outFields": "opcat_id,opcat_name",
                         "returnGeometry": "true", "outSR": "4326", "f": "json"})
        if not d.get("features"):
            sys.exit(f"opcat {oid} not found")
        ops.append((oid, d["features"][0]["attributes"]["opcat_name"], d["features"][0]["geometry"]))
    opname = " + ".join(nm for _, nm, _ in ops)
    rgeom = {"rings": [r for _, _, g in ops for r in g["rings"]]}
    river = a.river or f"River {ops[0][1].split(',')[0].split(' and ')[0].strip()}"

    wbs, est_ids, est_rings = {}, [], []
    if a.coastal:
        # a coastal stretch: the TraC opcats are the outline; no river water bodies
        for oid, nm, g in ops:
            est_ids.append(oid)
            est_rings.append((nm, g.get("rings", [])))
    for oid, _nm, g in ([] if a.coastal else ops):
        poly = _poly(g)
        # 2. member river water bodies — authoritative list from the Catchment Data Explorer opcat page.
        with urllib.request.urlopen(CDE.format(oid), timeout=120) as r:
            html = r.read().decode("utf-8", "replace")
        cde_ids = sorted(set(re.findall(r"WaterBody/(GB[0-9]+)", html)))
        if not cde_ids:
            sys.exit(f"no water bodies found on the CDE page for opcat {oid}")
        # keep only ids that resolve as *river* water bodies (drops any lake/TraC ids), and get names
        found = {}
        for i in range(0, len(cde_ids), 50):
            chunk = cde_ids[i:i + 50]
            ids = "','".join(chunk)
            d2 = _get(WB, {"where": f"wb_id IN ('{ids}')", "outFields": "wb_id,wb_name",
                           "returnGeometry": "false", "f": "json"})
            for f in d2.get("features", []):
                found[f["attributes"]["wb_id"]] = f["attributes"]["wb_name"]
        dropped = [i for i in cde_ids if i not in found]
        if dropped:
            print(f"-- note: opcat {oid}: {len(dropped)} CDE id(s) not river WBs, dropped: {dropped}", file=sys.stderr)
        wbs.update(found)

        # 3. dedicated-estuary TraC opcats intersecting the river opcat (exclude broad coastal)
        est = _get(OPCAT, data={"geometry": poly, "geometryType": "esriGeometryPolygon", "inSR": "4326",
                                "spatialRel": "esriSpatialRelIntersects",
                                # every RBD's estuary/coastal opcats sit in a "<district> TraC" management
                                # catchment (South West TraC, Thames TraC, Severn England TraC, …)
                                "where": "mncat_name like '%TraC'",
                                "outFields": "opcat_id,opcat_name", "returnGeometry": "true",
                                "outSR": "4326", "f": "json"})
        for f in est.get("features", []):
            nm = f["attributes"]["opcat_name"]
            eid = int(f["attributes"]["opcat_id"])
            if is_estuary(nm) and eid not in est_ids and eid not in a.skip_estuaries:
                est_ids.append(eid)
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

    county = a.county or _majority_authority(rgeom) or _local_authority(centre) or "England"
    co = COMPANIES[a.company]
    cfg = {
        "name": a.slug,
        "river": river,
        "org_id": a.org_uuid,
        "county": county,
        "company": {"name": co["name"], "edm_feed": co["edm_feed"],
                    "annual_sheet_match": co["annual_sheet_match"]},
        **({"extra_companies": [
            {"name": COMPANIES[k]["name"], "edm_feed": COMPANIES[k]["edm_feed"],
             "annual_sheet_match": COMPANIES[k]["annual_sheet_match"]}
            for k in a.extra_companies if k != a.company]} if a.extra_companies else {}),
        "wfd": {
            **({"coastal": True, "exclude_other_orgs": True} if a.coastal else {}),
            "wb_ids": sorted(wbs),
            # list form (unioned by the importer); single-id configs still read estuary_opcat_id
            "estuary_opcat_ids": sorted(est_ids),
            "buffer_m": 150,
        },
        "geo": {"bbox": bbox, "centre": centre, "radius_km": radius_km},
        "edm_years": [2021, 2022, 2023, 2024],
        "provenance": (f"{river} import: EDM + WFD C2 — {len(wbs)} river WBs contained in "
                       + (f"coastal opcat(s) {a.opcat_id} ({opname}); " if a.coastal else
                          f"operational catchment opcat {a.opcat_id} ({opname}); estuaries ")
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
    print(f"-- {a.slug}: {len(wbs)} river WBs, {'coastal opcats' if a.coastal else 'estuaries'} "
          f"{est_ids or 'none'}, bbox {bbox}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
