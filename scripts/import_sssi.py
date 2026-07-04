#!/usr/bin/env python3
"""
Import Sites of Special Scientific Interest (England) into `protected_areas` for a catchment.
Part of layer 3 — see ../PRIORITY-SITES-METHOD.md.

The Natural England SSSI ArcGIS FeatureServer is token-gated, so we use the EA's public OGC API
Features endpoint, which supports a bbox query and returns one MultiPolygon per SSSI in WGS84
(CRS84 lon/lat by default) — no bulk national download, no reprojection. SSSIs are SODRP
high-priority. Geometry is simplified on insert (ST_SimplifyPreserveTopology) to keep large sites
(e.g. Dartmoor) manageable. Config-driven, idempotent.

Usage:
  python3 import_sssi.py --config ../config/catchments/teign.json > /tmp/sssi.sql
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 < /tmp/sssi.sql
"""
import json, os, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
OGC = os.environ.get(
    "SSSI_OGC",
    "https://environment.data.gov.uk/spatialdata/sites-of-special-scientific-interest-england/ogc/features/v1")
COLLECTION = "Sites_of_Special_Scientific_Interest_England"
SIMPLIFY_DEG = 0.0002  # ~20 m — shrinks stored geometry without visibly changing boundaries


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def round_coords(c, nd=5):
    if isinstance(c, list):
        if c and isinstance(c[0], (int, float)):
            return [round(x, nd) for x in c[:2]]
        return [round_coords(x, nd) for x in c]
    return c


def fetch(bbox):
    s, w, n, e = bbox
    feats, offset = [], 0
    while True:
        params = {"bbox": f"{w},{s},{e},{n}", "limit": 100, "offset": offset, "f": "json"}
        url = f"{OGC}/collections/{COLLECTION}/items?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=180, context=_SSL) as r:
            fc = json.load(r)
        got = fc.get("features", [])
        feats += got
        if len(got) < 100 or len(feats) >= (fc.get("numberMatched") or 0):
            return feats
        offset += len(got)


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    orgl = q(org) + "::uuid"
    feats = fetch(cfg["geo"]["bbox"])
    print(f"-- {len(feats)} SSSIs in the {cfg['river']} bbox", file=sys.stderr)

    out = [f"-- River Hub: Sites of Special Scientific Interest for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           f"delete from protected_areas where organisation_id = {orgl} and designation = 'sssi';"]
    for f in feats:
        geom = f.get("geometry")
        if not geom or "coordinates" not in geom:
            continue
        p = f.get("properties", {})
        g = json.dumps({"type": geom["type"], "coordinates": round_coords(geom["coordinates"])})
        out.append(
            "insert into protected_areas (organisation_id, designation, source_id, name, "
            "sodrp_high_priority, geom, source) values (" +
            f"{orgl}, 'sssi', {q(p.get('ref_code'))}, {q(p.get('name'))}, true, " +
            f"ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON('{g}'), 4326), {SIMPLIFY_DEG}), 'ne-sssi');")
    out.append(f"select 'SSSIs in catchment: ' || count(*) from protected_areas "
               f"where organisation_id = {orgl} and designation = 'sssi';")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
