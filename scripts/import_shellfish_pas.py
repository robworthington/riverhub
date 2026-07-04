#!/usr/bin/env python3
"""
Import EA WFD Shellfish Water Protected Areas (England) into `protected_areas` for a catchment.
Layer 1 of the protected/priority-site ingestion — see ../PRIORITY-SITES-METHOD.md.

Source: the authoritative EA GeoJSON on data.gov.uk (dataset a276c27a…), served as a zipped GeoJSON
in EPSG:27700 (British National Grid) with fields sfw_id + sfw_name. We embed the national set and
let PostGIS reproject (27700 -> 4326) and clip to the catchment bbox — no pyproj needed. Config-driven,
idempotent (replaces this org's shellfish_pa rows).

Usage:
  python3 import_shellfish_pas.py --config ../config/catchments/teign.json > /tmp/shellfish.sql
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 < /tmp/shellfish.sql
"""
import io, json, os, ssl, sys, urllib.request, zipfile

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
URL = os.environ.get(
    "SHELLFISH_URL",
    "https://environment.data.gov.uk/api/file/download?fileDataSetId=490de652-8c27-4537-aab3-5fc5ff455b7a"
    "&fileName=Water_Environment_Water_Framework_Directive_shellfish_water_protected_areas_in_England.geojson.zip",
)
SRID_SRC = 27700  # British National Grid — the download's native CRS


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def round_coords(c):
    """Round BNG coordinates to whole metres (shrinks the SQL; 1 m is ample for a boundary)."""
    if isinstance(c, list):
        if c and isinstance(c[0], (int, float)):
            return [round(x) for x in c[:2]]
        return [round_coords(x) for x in c]
    return c


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    s, w, n, e = cfg["geo"]["bbox"]  # lat_min, lon_min, lat_max, lon_max
    print("-- downloading EA WFD Shellfish Water PAs (England) …", file=sys.stderr)
    with urllib.request.urlopen(URL, timeout=300, context=_SSL) as r:
        blob = r.read()
    zf = zipfile.ZipFile(io.BytesIO(blob))
    gj_name = next(nm for nm in zf.namelist() if nm.lower().endswith(".geojson"))
    feats = json.loads(zf.read(gj_name)).get("features", [])
    print(f"-- {len(feats)} shellfish PAs nationally; PostGIS clips to the {cfg['river']} bbox", file=sys.stderr)

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: EA WFD Shellfish Water Protected Areas for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _sf(source_id text, name text, geom geometry) on commit drop;"]
    for f in feats:
        geom = f.get("geometry")
        if not geom or "coordinates" not in geom:
            continue
        p = f.get("properties", {})
        g = json.dumps({"type": geom["type"], "coordinates": round_coords(geom["coordinates"])})
        out.append(
            "insert into _sf values (" + q(str(p.get("sfw_id"))) + "," + q(p.get("sfw_name")) +
            ",ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON('" + g + "')," + str(SRID_SRC) + "),4326));")
    out.append(f"delete from protected_areas where organisation_id = {orgl} and designation = 'shellfish_pa';")
    out.append(f"""insert into protected_areas (organisation_id, designation, source_id, name, geom, source)
  select {orgl}, 'shellfish_pa', source_id, name, geom, 'ea-wfd-shellfish'
  from _sf
  where ST_Intersects(geom, ST_MakeEnvelope({w}, {s}, {e}, {n}, 4326));""")
    out.append(f"select 'shellfish PAs in catchment: ' || count(*) from protected_areas "
               f"where organisation_id = {orgl} and designation = 'shellfish_pa';")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
