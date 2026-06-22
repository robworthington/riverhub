#!/usr/bin/env python3
"""
Import EA Water Quality Archive per-SAMPLE observations for a catchment (granular, sample-level) into
ea_wq_samples. See ../WATER-TESTING-DATA-SOURCES.md.

Two-stage: (1) discover the catchment's EA sampling points (notation + location + WFD water body) from
the CaBA WQA summary-statistics ArcGIS layer by bbox; (2) for each point, pull every observation since
EA_OBS_FROM from the EA WQ Archive FastAPI ( /water-quality/sampling-point/{notation}/observation ,
Accept: text/csv, paginated with limit/skip). Config-driven, idempotent.

Env:  EA_OBS_FROM  earliest sample date (default 2021-01-01)
Usage:
    python3 import_ea_wq_samples.py --config ../config/catchments/dart.json > /tmp/eaobs.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/eaobs.sql
"""
import csv, io, json, os, ssl, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
SITES_FS = os.environ.get(
    "EAWQ_FS_URL",
    "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/"
    "WIMs_summary_statistics/FeatureServer/0",
)
OBS_BASE = os.environ.get("EAWQ_OBS_BASE", "https://environment.data.gov.uk/water-quality")
FROM = os.environ.get("EA_OBS_FROM", "2021-01-01")
PAGE = 250  # API max per page (observation limit ≤ 250)


def get_json(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=120, context=_SSL) as r:
        return json.load(r)


def get_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "river-hub", "Accept": "text/csv"})
    with urllib.request.urlopen(req, timeout=120, context=_SSL) as r:
        return r.read().decode("utf-8", "replace")


def sites(cfg):
    """Distinct EA sampling points in the catchment bbox: notation + lat/lng + label + water body."""
    s, w, n, e = cfg["geo"]["bbox"]
    env = json.dumps({"xmin": w, "ymin": s, "xmax": e, "ymax": n, "spatialReference": {"wkid": 4326}})
    seen, offset = {}, 0
    while True:
        page = get_json(f"{SITES_FS}/query", {
            "where": "1=1", "geometry": env, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "sample_samplingPoint_notation,sample_samplingPoint_label,wb_name",
            "returnGeometry": "true", "outSR": 4326, "resultOffset": offset, "resultRecordCount": 1000,
            "f": "json"})
        feats = page.get("features", [])
        for f in feats:
            a = f["attributes"]; g = f.get("geometry") or {}
            note = (a.get("sample_samplingPoint_notation") or "").strip()
            if note and note not in seen:
                seen[note] = {"notation": note, "label": a.get("sample_samplingPoint_label"),
                              "wb": a.get("wb_name"), "lon": g.get("x"), "lat": g.get("y")}
        if len(feats) < 1000:
            return list(seen.values())
        offset += len(feats)


def observations(notation):
    """All observations for a sampling point since FROM (paginated)."""
    rows, skip = [], 0
    while True:
        url = f"{OBS_BASE}/sampling-point/{urllib.parse.quote(notation)}/observation?" + urllib.parse.urlencode(
            {"dateFrom": FROM, "limit": PAGE, "skip": skip})
        try:
            text = get_csv(url)
        except Exception as e:
            print(f"-- obs fetch failed {notation} (skip {skip}): {e}", file=sys.stderr)
            return rows
        recs = list(csv.DictReader(io.StringIO(text)))
        rows += recs
        if len(recs) < PAGE:
            return rows
        skip += len(recs)


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
    pts = sites(cfg)
    print(f"-- {len(pts)} EA sampling points in {cfg['river']} bbox; pulling observations since {FROM}",
          file=sys.stderr)

    rows = []
    for i, p in enumerate(pts):
        obs = observations(p["notation"])
        for o in obs:
            ts = (o.get("phenomenonTime") or "").strip()
            det = (o.get("determinand.prefLabel") or "").strip()
            if not ts or not det:
                continue
            rows.append({
                "notation": p["notation"], "label": p["label"], "wb": p["wb"],
                "lon": p["lon"], "lat": p["lat"],
                "determinand": det, "unit": (o.get("unit") or "").strip() or None,
                "result": o.get("result"), "sampled_at": ts,
                "material": (o.get("sampleMaterialType") or "").strip() or None,
                "purpose": (o.get("samplingPurpose") or "").strip() or None,
            })
        if (i + 1) % 25 == 0:
            print(f"--  {i+1}/{len(pts)} points, {len(rows)} observations so far", file=sys.stderr)

    if not rows:
        sys.exit("no EA observations returned — check the catchment bbox / EA API")
    print(f"-- {len(rows)} EA observations across {len(pts)} points", file=sys.stderr)

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: EA WQ Archive per-sample observations for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _o(notation text, label text, wb text, lon float, lat float, "
           "determinand text, unit text, result numeric, sampled_at timestamptz, material text, "
           "purpose text) on commit drop;"]
    tuples = ["(" + ",".join([
            q(r["notation"]), q(r["label"]), q(r["wb"]),
            "null" if r["lon"] is None else repr(r["lon"]), "null" if r["lat"] is None else repr(r["lat"]),
            q(r["determinand"]), q(r["unit"]), num(r["result"]), q(r["sampled_at"]),
            q(r["material"]), q(r["purpose"]),
        ]) + ")" for r in rows]
    BATCH = 1000  # multi-row inserts: ~1 round-trip per 1000 rows instead of per row
    for i in range(0, len(tuples), BATCH):
        out.append("insert into _o values " + ",".join(tuples[i:i + BATCH]) + ";")
    out.append(f"delete from ea_wq_samples where organisation_id = {orgl};")
    out.append(f"""insert into ea_wq_samples (organisation_id, notation, site_label, determinand, unit,
    result, sampled_at, sample_material, purpose, wb_name, latitude, longitude, source)
  select distinct on (notation, determinand, sampled_at)
    {orgl}, notation, label, determinand, unit, result, sampled_at, material, purpose, wb, lat, lon,
    'ea-wqa-obs'
  from _o order by notation, determinand, sampled_at;""")
    out.append(f"select 'EA observations: ' || count(*) from ea_wq_samples where organisation_id = {orgl};")
    out.append(f"select 'sites: ' || count(distinct notation) || ', determinands: ' || "
               f"count(distinct determinand) from ea_wq_samples where organisation_id = {orgl};")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
