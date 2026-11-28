#!/usr/bin/env python3
"""
Natural Resources Wales's water quality samples for a Welsh catchment: step `ea-wq-samples` for
"nation": "wales" (WALES-ROLLOUT-PLAN.md §5). Rows go into the same `ea_wq_samples` table as the EA's,
with source 'nrw-wqa', so the river health verdicts, the water quality map and the sampling point pages
work unchanged.

Source: NRW's Open Water Quality Archive (dataset NRW_DS124903, OGL v3).
  * Sampling points: DataMapWales WFS `geonode:nrw_water_quality_archive_stations` (9,842 points, with
    location and the years each was sampled).
  * Results: one zip per year for all of Wales ("2024 Water Quality Archive.zip", 2–5 MB, about 300,000
    results), on NRW's ShareFile share, refreshed monthly. ShareFile refuses scripted downloads (it checks
    for a browser), so the files are copied by hand into this repo's `import-inputs` release as
    nrw-wq-<year>.zip; scripts/ci/fetch_inputs.sh fetches them into $NRW_WQ_DIR for the workflow. Each zip
    holds "<year> Water Quality Archive.csv" (the current file) and sometimes an older "Water Quality
    Archive.csv", which is ignored.

NRW and the EA share one laboratory vocabulary (both come from WIMS), so the fields map one to one:
station_number → notation, parameter_name → determinand ("Ammoniacal Nitrogen as N"), sampling_medium →
sample_material ("RIVER / RUNNING SURFACE WATER"), sampling_reason → purpose, sign "<"/">" → result_qualifier.
Results NRW flags as deviating (failed its ISO 17025 checks; NRW says not to use them in statistics) are
left out. Only points inside the river's outline (within 150 m) are kept, as the plan's §8 asks, to keep
the database small; the EA importer keeps the whole bounding box.

Env:  NRW_WQ_DIR   folder holding the yearly zips (or the extracted CSVs)
      EA_OBS_FROM  earliest sample date, shared with the EA importer (default 2021-01-01)
Usage:
    NRW_WQ_DIR=~/Downloads/nrw-wq python3 scripts/import_nrw_wq_samples.py --config config/catchments/teifi.json > /tmp/nrwwq.sql
"""
import csv, glob, io, os, re, sys, zipfile

import catchment_config
import wales_common as wc

LAYER = "geonode:nrw_water_quality_archive_stations"
FROM = os.environ.get("EA_OBS_FROM", "2021-01-01")
SOURCE = "nrw-wqa"
OUTLINE_M = 150


def year_files(folder):
    """{year: path} for the yearly files in the folder: zips or CSVs, NRW's names or nrw-wq-<year>.zip."""
    out = {}
    for path in glob.glob(os.path.join(folder, "*")):
        m = re.search(r"(?:^|[^0-9])(20[0-9]{2})(?:[^0-9]|$)", os.path.basename(path))
        if m and path.lower().endswith((".zip", ".csv")):
            y = int(m.group(1))
            if path.lower().endswith(".csv") or y not in out:   # an extracted CSV wins over its zip
                out[y] = path
    return out


def rows_of(path, year):
    """The yearly CSV's rows, read straight from the zip when it is one."""
    if path.lower().endswith(".csv"):
        with open(path, encoding="utf-8-sig", errors="replace", newline="") as f:
            yield from csv.DictReader(f)
        return
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv") and str(year) in os.path.basename(n)]
        if not names:
            sys.exit(f"{path}: no '{year} Water Quality Archive.csv' inside")
        with z.open(names[0]) as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""))


def num(v):
    v = (v or "").strip()
    try:
        return repr(float(v)) if v else "null"
    except ValueError:
        return "null"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    folder = os.path.expanduser(os.environ.get("NRW_WQ_DIR", ""))
    if not folder or not os.path.isdir(folder):
        sys.exit("NRW_WQ_DIR is not set to a folder of NRW Water Quality Archive files (see the docstring)")
    first = int(FROM[:4])
    files = {y: p for y, p in year_files(folder).items() if y >= first}
    if not files:
        sys.exit(f"no NRW Water Quality Archive files for {first} or later in {folder}")

    s, w, n, e = cfg["geo"]["bbox"]
    pad = 0.01
    stations = {}
    for f in wc.wfs(LAYER, props=["station_number", "station_name", "geom"],
                    bbox=(w - pad, s - pad, e + pad, n + pad)):
        p, g = f["properties"], f.get("geometry") or {}
        if g.get("coordinates"):
            stations[p["station_number"]] = (p["station_name"], g["coordinates"][0], g["coordinates"][1])
    print(f"-- {len(stations)} NRW sampling points in the {cfg['river']} bbox; years {sorted(files)}",
          file=sys.stderr)
    if not stations:
        sys.exit("no NRW sampling points in the bbox — check the config or the DataMapWales layer")

    rows, deviating = {}, 0
    for y in sorted(files):
        before = len(rows)
        for r in rows_of(files[y], y):
            st = r.get("station_number")
            if st not in stations:
                continue
            ts, det = (r.get("sampling_datetime") or "").strip(), (r.get("parameter_name") or "").strip()
            if not ts or not det or ts < FROM:
                continue
            if (r.get("deviating_result") or "").strip():
                deviating += 1
                continue
            sign = (r.get("sign") or "").strip()
            # one result per point, determinand and time (the table's key); a later file's row wins
            rows[(st, det, ts)] = (st, det, (r.get("unit_symbol") or "").strip(), r.get("sample_value"),
                                   sign if sign in ("<", ">") else "", ts,
                                   (r.get("sampling_medium") or "").strip(), (r.get("sampling_reason") or "").strip())
        print(f"--  {y}: {len(rows) - before} results", file=sys.stderr)
    if not rows:
        sys.exit(f"no NRW results for the {cfg['river']} sampling points since {FROM}")
    print(f"-- {len(rows)} results at {len({k[0] for k in rows})} points; {deviating} deviating results left out",
          file=sys.stderr)

    orgl = wc.q(org) + "::uuid"
    out = [f"-- River Hub: NRW Water Quality Archive samples for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _o(notation text, label text, lon float, lat float, determinand text, unit text, "
           "result numeric, qualifier text, sampled_at timestamptz, material text, purpose text) on commit drop;"]
    tuples = []
    for st, det, unit, val, sign, ts, material, purpose in rows.values():
        label, lon, lat = stations[st]
        tuples.append("(" + ",".join([wc.q(st), wc.q(label), repr(lon), repr(lat), wc.q(det), wc.q(unit),
                                      num(val), wc.q(sign), wc.q(ts), wc.q(material), wc.q(purpose)]) + ")")
    for i in range(0, len(tuples), 1000):
        out.append("insert into _o values " + ",".join(tuples[i:i + 1000]) + ";")
    out.append(f"delete from ea_wq_samples where organisation_id = {orgl} and source = '{SOURCE}';")
    # the outline test runs once per point, not once per result
    out.append(f"""with pts as (select distinct notation, lon, lat from _o),
keep as (
  select p.notation from pts p
  where not exists (select 1 from catchment_boundaries b where b.organisation_id = {orgl})
     or exists (select 1 from catchment_boundaries b where b.organisation_id = {orgl}
                and ST_DWithin(b.geom::geography, ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography, {OUTLINE_M}))
)
insert into ea_wq_samples (organisation_id, notation, site_label, determinand, unit,
    result, result_qualifier, sampled_at, sample_material, purpose, latitude, longitude, source)
  select {orgl}, o.notation, o.label, o.determinand, o.unit, o.result, o.qualifier, o.sampled_at, o.material,
    o.purpose, o.lat, o.lon, '{SOURCE}'
  from _o o join keep k on k.notation = o.notation
  on conflict (organisation_id, notation, determinand, sampled_at) do nothing;""")
    out.append(f"select 'NRW results: ' || count(*) || ' at ' || count(distinct notation) || ' points, ' || "
               f"count(distinct determinand) || ' determinands' from ea_wq_samples "
               f"where organisation_id = {orgl} and source = '{SOURCE}';")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
