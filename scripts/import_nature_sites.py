#!/usr/bin/env python3
"""
Import Natural England statutory nature-site boundaries into `protected_areas` for a catchment.
Layer 3 of the protected/priority-site ingestion — see ../PRIORITY-SITES-METHOD.md.

Covers SAC, SPA, Ramsar and MCZ from the Natural England / DEFRA ArcGIS FeatureServers. Each layer
is queried by the catchment bbox with outSR=4326 & f=geojson, so features come back already in WGS84
and pre-clipped server-side — no bulk download, no reprojection. All four are SODRP high-priority
designations, so sodrp_high_priority is set. Config-driven, idempotent (replaces this org's rows for
the designations it loads).

NOTE: SSSI is not included — the SSSI FeatureServer is token-gated; source it from the data.gov.uk
bulk GeoJSON in a follow-up (see the method doc).

Usage:
  python3 import_nature_sites.py --config ../config/catchments/teign.json > /tmp/nature.sql
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 < /tmp/nature.sql
"""
import json, os, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
BASE = os.environ.get("NE_ARCGIS_BASE", "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services")

# designation -> (service name, name field, code field)
LAYERS = [
    ("sac", "Special_Areas_of_Conservation_England", "SAC_NAME", "SAC_CODE"),
    ("spa", "Special_Protection_Areas_England", "SPA_NAME", "SPA_CODE"),
    ("ramsar", "Ramsar_England", "NAME", "CODE"),
    ("mcz", "Marine_Conservation_Zones_England", "MCZ_NAME", "MCZ_CODE"),
]


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def round_coords(c, nd=5):
    if isinstance(c, list):
        if c and isinstance(c[0], (int, float)):
            return [round(x, nd) for x in c[:2]]
        return [round_coords(x, nd) for x in c]
    return c


def fetch_layer(service, name_f, code_f, bbox):
    s, w, n, e = bbox
    feats, offset = [], 0
    while True:
        params = {
            "where": "1=1",
            "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": f"{name_f},{code_f}", "outSR": 4326, "returnGeometry": "true",
            "resultOffset": offset, "resultRecordCount": 1000, "f": "geojson",
        }
        url = f"{BASE}/{service}/FeatureServer/0/query?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=180, context=_SSL) as r:
            fc = json.load(r)
        got = fc.get("features", [])
        feats += got
        if len(got) < 1000:
            return feats
        offset += len(got)


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    bbox = cfg["geo"]["bbox"]  # [lat_min, lon_min, lat_max, lon_max]
    orgl = q(org) + "::uuid"

    # Sites arrive as multipart polygons (many rows share one code); stage the parts then
    # ST_Collect them into one row per (designation, code) to satisfy unique(org,designation,source_id).
    out = [f"-- River Hub: Natural England nature sites (SAC/SPA/Ramsar/MCZ) for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _ns(designation text, source_id text, name text, geom geometry) on commit drop;"]
    parts = 0
    for desig, service, name_f, code_f in LAYERS:
        feats = fetch_layer(service, name_f, code_f, bbox)
        print(f"-- {desig}: {len(feats)} feature parts in the {cfg['river']} bbox", file=sys.stderr)
        for f in feats:
            geom = f.get("geometry")
            if not geom or "coordinates" not in geom:
                continue
            p = f.get("properties", {})
            g = json.dumps({"type": geom["type"], "coordinates": round_coords(geom["coordinates"])})
            out.append(
                f"insert into _ns values ('{desig}', {q(p.get(code_f))}, {q(p.get(name_f))}, "
                f"ST_SetSRID(ST_GeomFromGeoJSON('{g}'), 4326));")
            parts += 1
    out.append(f"delete from protected_areas where organisation_id = {orgl} "
               f"and designation in ('sac','spa','ramsar','mcz');")
    out.append(f"""insert into protected_areas (organisation_id, designation, source_id, name, sodrp_high_priority, geom, source)
  select {orgl}, designation, source_id, max(name), true, ST_Collect(geom), 'ne-' || designation
  from _ns group by designation, source_id;""")
    out.append(f"select designation, count(*) from protected_areas where organisation_id = {orgl} "
               f"and designation in ('sac','spa','ramsar','mcz') group by designation order by designation;")
    out.append("commit;")
    print(f"-- {parts} feature parts staged", file=sys.stderr)
    print("\n".join(out))


if __name__ == "__main__":
    main()
