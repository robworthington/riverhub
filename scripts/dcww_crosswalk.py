#!/usr/bin/env python3
"""
Match Dŵr Cymru Welsh Water's live storm overflow outlets to their annual EDM return rows
(WALES-ROLLOUT-PLAN.md §4, item 5). Standard library only.

DCWW's public live feed (Spill_Prod__External) identifies outlets by DCWW_ID (DCWW1001…) and carries no
permit number. The annual returns (the Rivers Trust's England-and-Wales 2025 layer, OGL) identify them by
EA/NRW permit and activity reference. The only shared key is location, so each live outlet is matched to
the annual-return outlets within --radius metres, preferring the one whose name shares the most words.
Several live outlets can share a permit (a site with more than one overflow); that is kept, not an error.

Writes CSV to stdout: dcww_id, asset_name, permit, activity_ref, site_name_ea, distance_m, name_words,
confidence (high = within 50 m and a shared name word; medium = within the radius; none = no candidate).
  python3 scripts/dcww_crosswalk.py > batches/dcww_crosswalk.csv
"""
import argparse
import csv
import json
import math
import re
import sys
import urllib.parse
import urllib.request

LIVE = "https://services3.arcgis.com/KLNF7YxtENPLYVey/arcgis/rest/services/Spill_Prod__External/FeatureServer/0"
ANNUAL = ("https://services3.arcgis.com/Bb8lfThdhugyc4G3/ArcGIS/rest/services/"
          "Event_Duration_Monitoring_Storm_Overflows_2025/FeatureServer/0")
STOP = {"storm", "overflow", "cso", "sso", "so", "sps", "wwtw", "stw", "pumping", "station", "ps", "combined",
        "sewer", "sewage", "treatment", "works", "the", "of", "and", "rd", "road", "st"}


def fetch(base, where, fields):
    out, off = [], 0
    while True:
        p = {"where": where, "outFields": fields, "returnGeometry": "true", "outSR": 4326,
             "resultOffset": off, "resultRecordCount": 1000, "f": "json"}
        req = urllib.request.Request(base + "/query?" + urllib.parse.urlencode(p),
                                     headers={"User-Agent": "river-hub-importer"})
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        if "error" in d:
            sys.exit(f"{base}: {d['error']}")
        feats = d.get("features", [])
        out += feats
        if len(feats) < 1000 and not d.get("exceededTransferLimit"):
            return out
        off += len(feats)


def metres(a, b):
    (x1, y1), (x2, y2) = a, b
    return math.hypot((x1 - x2) * 111320 * math.cos(math.radians((y1 + y2) / 2)), (y1 - y2) * 110540)


def words(s):
    return {w for w in re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split() if w not in STOP and len(w) > 1}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--radius", type=float, default=100, help="match radius in metres (default 100)")
    a = ap.parse_args()

    live = [f for f in fetch(LIVE, "1=1", "DCWW_ID,asset_name") if f.get("geometry")]
    annual = [f["attributes"] for f in fetch(ANNUAL, "waterCompanyName = 'Dwr Cymru Welsh Water'",
                                             "siteNameEA,permitReferenceEA,activityReference,Latitude,Longitude")
              if f["attributes"].get("Latitude") is not None]
    for r in annual:
        r["_p"], r["_w"] = (r["Longitude"], r["Latitude"]), words(r["siteNameEA"])

    w = csv.writer(sys.stdout)
    w.writerow(["dcww_id", "asset_name", "permit", "activity_ref", "site_name_ea", "distance_m", "name_words",
                "confidence"])
    counts = {"high": 0, "medium": 0, "none": 0}
    for f in live:
        at, p = f["attributes"], (f["geometry"]["x"], f["geometry"]["y"])
        lw = words(at["asset_name"])
        near = [(metres(p, r["_p"]), r) for r in annual]
        near = [(d, r) for d, r in near if d <= a.radius]
        if not near:
            counts["none"] += 1
            w.writerow([at["DCWW_ID"], at["asset_name"], "", "", "", "", "", "none"])
            continue
        # most shared name words first, then nearest
        d, r = min(near, key=lambda t: (-len(lw & t[1]["_w"]), t[0]))
        shared = len(lw & r["_w"])
        conf = "high" if d <= 50 and shared else "medium"
        counts[conf] += 1
        w.writerow([at["DCWW_ID"], at["asset_name"], r["permitReferenceEA"], r["activityReference"],
                    r["siteNameEA"], round(d), shared, conf])
    print(f"-- {len(live)} live outlets, {len(annual)} annual-return outlets: "
          f"{counts['high']} high, {counts['medium']} medium, {counts['none']} unmatched", file=sys.stderr)


if __name__ == "__main__":
    main()
