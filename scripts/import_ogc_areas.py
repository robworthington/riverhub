#!/usr/bin/env python3
"""
Import WFD/context designations into `protected_areas` via the EA OGC API Features endpoints.
See ../PRIORITY-SITES-METHOD.md.

Generic, config-driven over LAYERS: each layer is an EA OGC API Features collection queried by the
catchment bbox (returns WGS84 GeoJSON — no bulk download, no reprojection). Currently loads Drinking
Water Protected Areas (Surface Water), whose feature id (drwpa_id) IS the WFD water-body id, so it is
also stored as wfd_wb_id. These are context layers, NOT SODRP high-priority (sodrp_high_priority=false).

Multipart parts are staged then ST_Collect-ed into one row per (designation, id). Idempotent.

NOTE: Nitrate Vulnerable Zones offer WMS + bulk GeoJSON only (no OGC Features endpoint found), and
Nutrient-Neutrality Catchments (ArcGIS) don't cover Devon — both are follow-ups (see the method doc).

Usage:
  python3 import_ogc_areas.py --config ../config/catchments/teign.json > /tmp/ogc.sql
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 < /tmp/ogc.sql
"""
import json, os, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
OGC_ROOT = os.environ.get("EA_OGC_ROOT", "https://environment.data.gov.uk/spatialdata")
SIMPLIFY_DEG = 0.0002  # ~20 m

# designation, slug, collection, name field, id field, wfd-id field (or None), sodrp_high_priority
LAYERS = [
    ("drinking_water_pa", "drinking-water-protected-areas-surface-water",
     "Drinking_Water_Protected_Areas_Surface_Water", "wb_name", "drwpa_id", "drwpa_id", False),
]


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def round_coords(c, nd=5):
    if isinstance(c, list):
        if c and isinstance(c[0], (int, float)):
            return [round(x, nd) for x in c[:2]]
        return [round_coords(x, nd) for x in c]
    return c


def fetch(slug, collection, bbox):
    s, w, n, e = bbox
    base = f"{OGC_ROOT}/{slug}/ogc/features/v1/collections/{collection}/items"
    feats, offset = [], 0
    while True:
        params = {"bbox": f"{w},{s},{e},{n}", "limit": 100, "offset": offset, "f": "json"}
        with urllib.request.urlopen(f"{base}?" + urllib.parse.urlencode(params), timeout=180, context=_SSL) as r:
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
    bbox = cfg["geo"]["bbox"]

    out = [f"-- River Hub: EA OGC context designations for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _og(designation text, source_id text, name text, wfd_wb_id text, "
           "sodrp boolean, geom geometry) on commit drop;"]
    designations = []
    for desig, slug, coll, name_f, id_f, wfd_f, sodrp in LAYERS:
        feats = fetch(slug, coll, bbox)
        print(f"-- {desig}: {len(feats)} features in the {cfg['river']} bbox", file=sys.stderr)
        designations.append(desig)
        for f in feats:
            geom = f.get("geometry")
            if not geom or "coordinates" not in geom:
                continue
            p = f.get("properties", {})
            g = json.dumps({"type": geom["type"], "coordinates": round_coords(geom["coordinates"])})
            wfd = p.get(wfd_f) if wfd_f else None
            out.append(
                f"insert into _og values ('{desig}', {q(p.get(id_f))}, {q(p.get(name_f))}, {q(wfd)}, "
                f"{'true' if sodrp else 'false'}, "
                f"ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON('{g}'), 4326), {SIMPLIFY_DEG}));")
    desig_list = ",".join(f"'{d}'" for d in designations)
    out.append(f"delete from protected_areas where organisation_id = {orgl} and designation in ({desig_list});")
    out.append(f"""insert into protected_areas (organisation_id, designation, source_id, name, wfd_wb_id, sodrp_high_priority, geom, source)
  select {orgl}, designation, source_id, max(name), max(wfd_wb_id), bool_or(sodrp), ST_Collect(geom), 'ea-ogc'
  from _og group by designation, source_id;""")
    out.append(f"select designation, count(*) from protected_areas where organisation_id = {orgl} "
               f"and designation in ({desig_list}) group by designation order by designation;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
