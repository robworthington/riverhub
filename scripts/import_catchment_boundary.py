#!/usr/bin/env python3
"""
Store a river's catchment outline in `catchment_boundaries` (migration 0115).

The outline is the union of the config's WFD river water-body catchments (`wfd.wb_ids`, the same
list import_water_bodies.py loads) and its estuary operational catchments (`wfd.estuary_opcat_ids`
or the single `estuary_opcat_id`). Every config has these, including the early hand-built ones
that record no river opcat id.

Why: several importers pick records by the config's bounding box, so a river also collects its
neighbours' records (the Dart's EA list held Teign, Erme and Avon sampling points). Pages that give
a river-level verdict, such as River health, clip to this outline instead.

Geometry is generalised at source (~20 m) to keep the row small. Config-driven, idempotent.

Usage:
  python3 import_catchment_boundary.py --config ../config/catchments/dart.json > /tmp/boundary.sql
  docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 < /tmp/boundary.sql
"""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
WB = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query"
OPCAT = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDSurfaceWaterOperationalCatchmentsCycle2/FeatureServer/0/query"
OFFSET_DEG = float(os.environ.get("BOUNDARY_OFFSET_DEG", "0.0002"))  # ~20 m generalisation


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def post(url, data, tries=5):
    body = urllib.parse.urlencode(data).encode()
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=180, context=_SSL) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, OSError):
            if i == tries - 1:
                raise
            time.sleep(10 * (i + 1))


def polygons(url, where):
    d = post(url, {"where": where, "outFields": "*", "returnGeometry": "true", "outSR": "4326",
                   "maxAllowableOffset": OFFSET_DEG, "geometryPrecision": 6, "f": "json"})
    if "error" in d:
        sys.exit(f"ArcGIS error: {d['error']}")
    out = []
    for f in d.get("features", []):
        rings = (f.get("geometry") or {}).get("rings")
        if rings:
            # ESRI rings -> GeoJSON Polygon; ST_MakeValid sorts out ring orientation and holes
            out.append(json.dumps({"type": "Polygon", "coordinates": rings}))
    return out


def main():
    cfg = catchment_config.load()
    w = cfg.get("wfd", {})
    wb_ids = w.get("wb_ids") or []
    if not wb_ids:
        sys.exit("config has no wfd.wb_ids")
    ests = w.get("estuary_opcat_ids") or ([w["estuary_opcat_id"]] if w.get("estuary_opcat_id") else [])

    parts = []
    for i in range(0, len(wb_ids), 50):
        chunk = "','".join(wb_ids[i:i + 50])
        parts += polygons(WB, f"wb_id IN ('{chunk}')")
    n_wb = len(parts)
    if ests:
        parts += polygons(OPCAT, "opcat_id IN (" + ",".join(str(int(e)) for e in ests) + ")")
    if not parts:
        sys.exit("no polygons returned for the config's water bodies")
    print(f"-- {cfg['river']}: {n_wb} water-body polygons + {len(parts) - n_wb} estuary polygons",
          file=sys.stderr)

    org = q(cfg["org_id"]) + "::uuid"
    geoms = ",\n  ".join(f"ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON('{p}'), 4326))" for p in parts)
    src = f"WFD river WB catchments ({n_wb}) + estuary opcats {ests or 'none'}"
    print(f"""-- River Hub: catchment outline for {cfg['river']} (OGL v3, EA WFD Cycle 2). Idempotent.
begin;
insert into catchment_boundaries (organisation_id, geom, source, updated_at)
select {org},
  ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(array[
  {geoms}
  ]))), 3)),
  {q(src)}, now()
on conflict (organisation_id) do update set geom = excluded.geom, source = excluded.source, updated_at = now();
select 'catchment outline: ' || round((ST_Area(geom::geography) / 1e6)::numeric, 1) || ' km2'
  from catchment_boundaries where organisation_id = {org};
commit;""")


if __name__ == "__main__":
    main()
