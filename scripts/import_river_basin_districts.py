#!/usr/bin/env python3
"""
Load England's river basin districts (RBDs) into `river_basin_districts` and place every river in one.

Source: the EA's WFD Cycle 2 surface-water operational catchments (the same FeatureServer the
catchment pipeline uses). Each operational catchment carries its rbd_id/rbd_name; there is no
separate district layer, so the district outline is built in PostGIS by merging its catchments,
dropping the slivers and pinholes left where neighbouring catchments don't quite meet, and
simplifying (~300 m) — plenty for drawing a district on a map, and ~100 KB for all 11.

The cross-border districts (Severn, Dee, Solway Tweed) cover their English part only, as this is EA
(England) data; "Western Wales" appears as a small English fragment.

Emits idempotent SQL on stdout (upserts districts by EA rbd_id, then re-places every river with
assign_river_districts(true)). Needs migration 0094. Standard library only; use /usr/bin/python3 on
this Mac (the default python3 lacks the CA certificates the EA server needs). Usage:

  /usr/bin/python3 scripts/import_river_basin_districts.py > /tmp/rbd.sql
  docker exec -i supabase_db_river-hub psql -U postgres -v ON_ERROR_STOP=1 < /tmp/rbd.sql   # local
  docker run --rm -i postgres:16 psql "<session-pooler-URI>" -v ON_ERROR_STOP=1 < /tmp/rbd.sql  # hosted

`--chunks DIR` instead writes the same SQL as numbered files under ~1.5 MB each, for running through
a client with a statement-size limit (each file is self-contained; run them in order).
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

OPCAT = ("https://environment.data.gov.uk/arcgis/rest/services/EA/"
         "WFDSurfaceWaterOperationalCatchmentsCycle2/FeatureServer/0/query")
PAGE = 1000
# Generalise at the source (degrees): the outline is for display and district membership, and this
# keeps the download ~2.5 MB instead of tens of MB. Final simplification happens in PostGIS.
SOURCE_OFFSET = 0.001
SIMPLIFY = 0.003          # degrees, applied after merging
MIN_PART_M2 = 2_000_000   # drop island/sliver parts smaller than 2 km²
STAGING = "rbd_import_opcat"


def fetch_opcats():
    feats, offset = [], 0
    while True:
        params = {
            "where": "1=1",
            "outFields": "opcat_id,rbd_id,rbd_name",
            "outSR": 4326,
            "maxAllowableOffset": SOURCE_OFFSET,
            "geometryPrecision": 5,
            "resultOffset": offset,
            "resultRecordCount": PAGE,
            "f": "geojson",
        }
        req = urllib.request.Request(OPCAT + "?" + urllib.parse.urlencode(params),
                                     headers={"User-Agent": "river-hub-importer"})
        with urllib.request.urlopen(req, timeout=180) as r:
            page = json.load(r)
        got = page.get("features", [])
        feats.extend(got)
        if not page.get("exceededTransferLimit") and len(got) < PAGE:
            return feats
        offset += len(got)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def statements(feats):
    """Yield SQL statements in order. Staging is a real (unlogged) table, not a temp table, so the
    load can be split across separate client calls when --chunks is used."""
    yield (f"drop table if exists {STAGING};\n"
           f"create unlogged table {STAGING} (opcat_id int, rbd_id int, rbd_name text, "
           f"geom geometry(Geometry, 4326));\n")
    for f in feats:
        p, g = f["properties"], f["geometry"]
        if not g:
            continue
        yield (f"insert into {STAGING} values ({int(p['opcat_id'])}, {int(p['rbd_id'])}, "
               f"{q(p['rbd_name'])}, ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON({q(json.dumps(g))}), 4326)));\n")
    names = {int(f["properties"]["rbd_id"]): f["properties"]["rbd_name"] for f in feats}
    slug_case = " ".join(f"when {i} then {q(slugify(n))}" for i, n in sorted(names.items()))
    yield f"""
-- Merge each district's catchments; keep each part's outer ring only (the union leaves ~1,400 pinholes
-- per district along shared edges) and drop parts under {MIN_PART_M2 // 1_000_000} km² (slivers), then simplify.
with parts as (
  select rbd_id, rbd_name,
         ST_MakePolygon(ST_ExteriorRing((ST_Dump(ST_Union(ST_Buffer(geom, 0)))).geom)) as g
  from {STAGING}
  group by rbd_id, rbd_name
),
merged as (
  select rbd_id, rbd_name,
         ST_Multi(ST_CollectionExtract(ST_MakeValid(
           ST_SimplifyPreserveTopology(ST_Union(g), {SIMPLIFY})), 3))::geometry(MultiPolygon, 4326) as geom
  from parts
  where ST_Area(g::geography) > {MIN_PART_M2}
  group by rbd_id, rbd_name
)
insert into river_basin_districts (id, slug, name, geom, loaded_at)
select rbd_id, case rbd_id {slug_case} end, rbd_name, geom, now() from merged
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, geom = excluded.geom, loaded_at = excluded.loaded_at;

drop table {STAGING};

-- Re-place every river now that the outlines are (re)loaded.
select assign_river_districts(true) as rivers_placed;
select d.name as district, count(o.id) as rivers
from river_basin_districts d left join organisations o on o.rbd_id = d.id and o.river_slug is not null
group by d.name order by rivers desc, d.name;
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--chunks", metavar="DIR", help="write numbered SQL files under ~1.5 MB instead of stdout")
    a = ap.parse_args()

    feats = fetch_opcats()
    n_rbd = len({f["properties"]["rbd_id"] for f in feats})
    print(f"-- {len(feats)} operational catchments across {n_rbd} river basin districts", file=sys.stderr)

    if not a.chunks:
        sys.stdout.write("begin;\n")
        for s in statements(feats):
            sys.stdout.write(s)
        sys.stdout.write("commit;\n")
        return

    os.makedirs(a.chunks, exist_ok=True)
    limit, buf, idx = 1_500_000, [], 1

    def flush():
        nonlocal buf, idx
        if buf:
            path = os.path.join(a.chunks, f"{idx:02d}.sql")
            with open(path, "w") as fh:
                fh.write("".join(buf))
            print(f"-- wrote {path}", file=sys.stderr)
            buf, idx = [], idx + 1

    for s in statements(feats):
        if buf and sum(map(len, buf)) + len(s) > limit:
            flush()
        buf.append(s)
    flush()


if __name__ == "__main__":
    main()
