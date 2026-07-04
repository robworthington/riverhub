#!/usr/bin/env python3
"""
Import EA designated Bathing Waters (England) into `protected_areas` for a catchment.
Layer 2 of the protected/priority-site ingestion — see ../PRIORITY-SITES-METHOD.md.

Source: the EA Bathing Water Quality API (environment.data.gov.uk/doc/bathing-water.json). Each
bathing water carries an eubwid, name, a WGS84 sampling point, water type (coastal/inland) and the
latest annual compliance classification (Excellent/Good/Sufficient/Poor). Coordinates are already
4326 so no reprojection is needed. Bathing waters are SODRP high-priority (2035 target), so
sodrp_high_priority is set. Config-driven, idempotent (replaces this org's bathing_water rows).

The classification changes yearly — re-run to refresh.

Usage:
  python3 import_bathing_waters.py --config ../config/catchments/teign.json > /tmp/bw.sql
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 < /tmp/bw.sql
"""
import json, os, ssl, sys, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
API = os.environ.get("BW_API", "https://environment.data.gov.uk/doc/bathing-water.json")


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def name_of(x):
    return x.get("_value") if isinstance(x, dict) else x


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    s, w, n, e = cfg["geo"]["bbox"]  # lat_min, lon_min, lat_max, lon_max

    items, page = [], 0
    while True:
        url = f"{API}?_pageSize=500&_page={page}"
        with urllib.request.urlopen(url, timeout=180, context=_SSL) as r:
            got = json.load(r).get("result", {}).get("items", [])
        items += got
        if len(got) < 500:
            break
        page += 1
    print(f"-- {len(items)} bathing waters nationally", file=sys.stderr)

    rows = []
    for it in items:
        sp = it.get("samplingPoint") or {}
        lat, lon = sp.get("lat"), sp.get("long")
        if lat is None or lon is None or not (s <= lat <= n and w <= lon <= e):
            continue
        types = it.get("type") or []
        water_type = ("coastal" if any("Coastal" in str(t) for t in types)
                      else "inland" if any("Inland" in str(t) for t in types) else None)
        cc = (it.get("latestComplianceAssessment") or {}).get("complianceClassification") or {}
        rows.append({
            "id": it.get("eubwidNotation"),
            "name": name_of(it.get("name")),
            "lat": lat, "lon": lon,
            "attrs": {"classification": name_of(cc.get("name")) if isinstance(cc, dict) else None,
                      "water_type": water_type, "year_designated": it.get("yearDesignated")},
        })
    print(f"-- {len(rows)} bathing waters in the {cfg['river']} bbox", file=sys.stderr)

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: EA designated Bathing Waters for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           f"delete from protected_areas where organisation_id = {orgl} and designation = 'bathing_water';"]
    for r in rows:
        geom = f"ST_SetSRID(ST_MakePoint({r['lon']}, {r['lat']}), 4326)"
        out.append(
            "insert into protected_areas (organisation_id, designation, source_id, name, "
            "sodrp_high_priority, geom, attrs, source) values (" +
            f"{orgl}, 'bathing_water', {q(r['id'])}, {q(r['name'])}, true, {geom}, " +
            q(json.dumps(r["attrs"])) + "::jsonb, 'ea-bathing-water');")
    out.append(f"select 'bathing waters in catchment: ' || count(*) from protected_areas "
               f"where organisation_id = {orgl} and designation = 'bathing_water';")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
