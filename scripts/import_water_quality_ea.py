#!/usr/bin/env python3
"""
Import EA Water Quality Archive (WIMS) monitoring stats for a catchment — the Environment Agency's
routine laboratory chemistry/nutrient monitoring (ammonia, nitrate, orthophosphate, dissolved
oxygen, pH, conductivity, temperature) per sampling point × determinand × year. Open Government
Licence v3. See ../WATER-TESTING-DATA-SOURCES.md.

Source: the CaBA / Rivers Trust ArcGIS mirror of the WQA summary statistics (same host as the WINEP
layer), queried by the catchment bbox. The layer is wide (one row per site × determinand, with
F<year>_count/min/max/mean columns + the latest reading); this importer unpivots it to long rows
(one per site × determinand × year) into ea_wq_stats. Config-driven, idempotent.

Usage:
    python3 import_water_quality_ea.py --config ../config/catchments/dart.json > /tmp/eawq.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/eawq.sql
"""
import json, os, re, ssl, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
FS = os.environ.get(
    "EAWQ_FS_URL",
    "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/"
    "WIMs_summary_statistics/FeatureServer/0",
)


def get(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=120, context=_SSL) as r:
        return json.load(r)


def fetch(cfg):
    s, w, n, e = cfg["geo"]["bbox"]  # [south, west, north, east]
    env = json.dumps({"xmin": w, "ymin": s, "xmax": e, "ymax": n, "spatialReference": {"wkid": 4326}})
    feats, offset = [], 0
    while True:
        page = get(f"{FS}/query", {
            "where": "1=1", "geometry": env, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": "*",
            "returnGeometry": "true", "outSR": 4326,
            "resultOffset": offset, "resultRecordCount": 1000, "f": "json",
        })
        batch = page.get("features", [])
        feats += batch
        if len(batch) < 1000:
            return feats
        offset += len(batch)


def ms_to_date(ms):
    try:
        ms = float(ms)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date().isoformat() if ms > 0 else None


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def num(v):
    if v in (None, ""):
        return "null"
    try:
        return repr(float(v))
    except (TypeError, ValueError):
        return "null"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    feats = fetch(cfg)
    print(f"-- {len(feats)} EA WQA site×determinand rows in {cfg['river']} bbox", file=sys.stderr)

    # discover the years present from the F<year>_count_result columns + the latest-reading year
    sample_attrs = feats[0]["attributes"] if feats else {}
    years = sorted({int(m.group(1)) for k in sample_attrs
                    for m in [re.match(r"F(\d{4})_count_result$", k)] if m})
    latest_year = max(years) if years else None
    if not years:
        sys.exit("no F<year>_count_result columns found — check the layer schema")

    rows = []
    for f in feats:
        a = f["attributes"]; g = f.get("geometry") or {}
        notation = (a.get("sample_samplingPoint_notation") or "").strip()
        det = (a.get("determinand_label") or "").strip()
        if not notation or not det:
            continue
        lon, lat = g.get("x"), g.get("y")
        common = {
            "notation": notation, "site_label": a.get("sample_samplingPoint_label"),
            "determinand": det, "unit": a.get("determinand_unit_label"),
            "wb_name": a.get("wb_name"), "wb_cat": a.get("wb_cat"),
            "wfd_site": (str(a.get("WFDSite")).strip().lower() == "yes") if a.get("WFDSite") is not None else None,
            "caba": a.get("CaBA_Catch"), "lon": lon, "lat": lat,
        }
        for y in years:
            cnt = a.get(f"F{y}_count_result")
            if cnt in (None, 0):
                continue
            latest = y == latest_year
            rows.append({**common, "year": y, "n": cnt,
                         "vmin": a.get(f"F{y}_min_result"), "vmax": a.get(f"F{y}_max_result"),
                         "vmean": a.get(f"F{y}_mean_result"),
                         "latest_sample": ms_to_date(a.get(f"F{y}_latest_sample")) if latest else None,
                         "latest_result": a.get(f"F{y}_latest_result") if latest else None})

    if not rows:
        sys.exit("no EA WQA rows in bbox — check the catchment geo.bbox")

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: EA Water Quality Archive monitoring for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _wq(notation text, site_label text, determinand text, unit text, "
           "wb_name text, wb_cat text, wfd_site boolean, caba text, year int, n int, vmin numeric, "
           "vmax numeric, vmean numeric, latest_sample date, latest_result numeric, lon float, lat float) "
           "on commit drop;"]
    for r in rows:
        out.append("insert into _wq values (" + ",".join([
            q(r["notation"]), q(r["site_label"]), q(r["determinand"]), q(r["unit"]), q(r["wb_name"]),
            q(r["wb_cat"]), ("null" if r["wfd_site"] is None else str(r["wfd_site"]).lower()),
            q(r["caba"]), str(r["year"]), str(int(r["n"])), num(r["vmin"]), num(r["vmax"]), num(r["vmean"]),
            q(r["latest_sample"]), num(r["latest_result"]),
            "null" if r["lon"] is None else repr(r["lon"]), "null" if r["lat"] is None else repr(r["lat"]),
        ]) + ");")
    out.append(f"delete from ea_wq_stats where organisation_id = {orgl};")
    out.append(f"""insert into ea_wq_stats (organisation_id, notation, site_label, determinand, unit,
    wb_name, wb_cat, wfd_site, caba_catchment, year, n, vmin, vmax, vmean, latest_sample,
    latest_result, latitude, longitude, source)
  select distinct on (notation, determinand, year)
    {orgl}, notation, site_label, determinand, unit, wb_name, wb_cat, wfd_site, caba, year, n, vmin,
    vmax, vmean, latest_sample, latest_result, lat, lon, 'ea-wqa'
  from _wq order by notation, determinand, year;""")
    out.append(f"select 'EA WQ rows: ' || count(*) from ea_wq_stats where organisation_id = {orgl};")
    out.append(f"select 'distinct sites: ' || count(distinct notation) || ', determinands: ' || "
               f"count(distinct determinand) from ea_wq_stats where organisation_id = {orgl};")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
