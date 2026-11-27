#!/usr/bin/env python3
"""
Add the Welsh parts of the river basin districts to `river_basin_districts` (WALES-ROLLOUT-PLAN.md §4).

import_river_basin_districts.py builds each district from the EA's operational catchments, which cover
England only: Western Wales is a 500 km² English fragment, and the Severn and the Dee stop at the
border. This script reads Natural Resources Wales's WFD Cycle 3 river basin districts from the
DataMapWales WFS (OGL v3; same district ids as the EA's: 9 Severn, 10 Western Wales, 11 Dee), simplifies
them (~300 m, as the EA import) and merges each into the existing outline, so the national map and district pages show
the whole district. Run it after import_river_basin_districts.py whenever that is re-run.

Standard library only. Emits SQL on stdout:
  python3 scripts/import_wales_districts.py > /tmp/wales_rbd.sql
"""
import json
import math
import sys
import urllib.parse
import urllib.request

WFS = "https://datamap.gov.wales/geoserver/ows"
LAYER = "geonode:nrw_wfd_river_basin_districts_c3"
DISTRICTS = {9: "Severn", 10: "Western Wales", 11: "Dee"}   # the districts with land in Wales
TOLERANCE = 0.003          # degrees, as import_river_basin_districts.py (~200 m N-S, ~330 m E-W here)
MIN_RING_POINTS = 4


def fetch():
    params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": LAYER,
              "outputFormat": "application/json", "srsName": "EPSG:4326"}
    req = urllib.request.Request(WFS + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": "river-hub-importer"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)["features"]


def _perp(p, a, b):
    """Distance from p to the segment a-b, in degrees (fine for a tolerance this small)."""
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(points, tol):
    """Douglas-Peucker, iterative (rings run to tens of thousands of points)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0.0, None
        for i in range(s + 1, e):
            d = _perp(points[i], points[s], points[e])
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring):
    pts = [(round(x, 4), round(y, 4)) for x, y, *_ in ring]
    out = simplify(pts, TOLERANCE)
    if out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= MIN_RING_POINTS else None


def simplify_geometry(g):
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    out = []
    for poly in polys:
        shell = simplify_ring(poly[0])
        if shell is None:
            continue
        # holes are pinholes and lakes: the district outline is drawn without them, as for England
        out.append([shell])
    return {"type": "MultiPolygon", "coordinates": out}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    feats = [f for f in fetch() if int(f["properties"]["rbd_id"]) in DISTRICTS]
    found = {int(f["properties"]["rbd_id"]) for f in feats}
    missing = set(DISTRICTS) - found
    if missing:
        sys.exit(f"NRW layer is missing districts {sorted(missing)}; nothing loaded")
    out = ["-- River Hub: Welsh parts of the river basin districts, from NRW WFD Cycle 3 (OGL v3). Idempotent:",
           "-- each run rebuilds the outline as (EA outline) ∪ (NRW outline); re-running only re-adds the NRW part.",
           "begin;",
           "create temp table _nrw_rbd(id int, geom geometry) on commit drop;"]
    for f in feats:
        rid = int(f["properties"]["rbd_id"])
        g = simplify_geometry(f["geometry"])
        npts = sum(len(p[0]) for p in g["coordinates"])
        print(f"-- {DISTRICTS[rid]}: {len(g['coordinates'])} parts, {npts} points after simplifying", file=sys.stderr)
        out.append(f"insert into _nrw_rbd values ({rid}, "
                   f"ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON({q(json.dumps(g, separators=(',', ':')))}), 4326)));")
    out.append("""
-- Merge into the existing outline; keep outer rings only and drop slivers under 2 km², as the EA import does.
with merged as (
  select d.id, ST_Union(ST_Buffer(d.geom, 0), ST_Buffer(n.geom, 0)) as g
  from river_basin_districts d join _nrw_rbd n on n.id = d.id
),
parts as (
  select id, ST_MakePolygon(ST_ExteriorRing((ST_Dump(g)).geom)) as g from merged
),
cleaned as (
  select id, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_Union(g), 0.001)), 3))
           ::geometry(MultiPolygon, 4326) as geom
  from parts where ST_Area(g::geography) > 2000000
  group by id
)
update river_basin_districts d set geom = c.geom, loaded_at = now()
from cleaned c where c.id = d.id;

select id, name, round((ST_Area(geom::geography) / 1e6)::numeric) as km2, ST_NPoints(geom) as points
from river_basin_districts where id in (9, 10, 11) order by id;
commit;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
