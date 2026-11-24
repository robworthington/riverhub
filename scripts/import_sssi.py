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
import json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request

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


def _get_json(url, tries=6):
    """GET with backoff: the EA spatial-data service answers bursts with 429 and is sometimes slow."""
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180, context=_SSL) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 15 * (i + 1)
        except (TimeoutError, OSError):  # socket.timeout, connection reset
            if i == tries - 1:
                raise
            wait = 15 * (i + 1)
        print(f"-- SSSI service busy, retrying in {wait}s", file=sys.stderr)
        time.sleep(wait)


def fetch(bbox):
    """Every SSSI intersecting the bbox, one feature per site.

    The service pages with `startIndex` and ignores `offset`, so paging with offset fetched page one
    again and the second insert of each site hit the unique key (any catchment with >100 SSSIs).
    Follow the response's own rel=next link instead, and drop repeats by ref_code as a safeguard."""
    s, w, n, e = bbox
    params = {"bbox": f"{w},{s},{e},{n}", "limit": 100, "f": "json"}
    url = f"{OGC}/collections/{COLLECTION}/items?" + urllib.parse.urlencode(params)
    feats, seen, start = [], set(), 0
    while url:
        fc = _get_json(url)
        got = fc.get("features", [])
        new = 0
        for f in got:
            ref = (f.get("properties") or {}).get("ref_code") or f.get("id")
            if ref in seen:
                continue
            seen.add(ref)
            feats.append(f)
            new += 1
        matched = fc.get("numberMatched")
        if not got or new == 0 or (matched is not None and len(feats) >= matched):
            break
        nxt = next((l.get("href") for l in fc.get("links", []) if l.get("rel") == "next"), None)
        start += len(got)
        url = nxt or (f"{OGC}/collections/{COLLECTION}/items?"
                      + urllib.parse.urlencode({**params, "startIndex": start}))
    return feats


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
