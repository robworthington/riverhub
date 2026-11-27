#!/usr/bin/env python3
"""
Import per-spill EDM start/stop events into spill_events (granular event-level history).

Two interchangeable sources, auto-detected by column layout — both keyed by the water company's own
outlet id (`Unique ID`), which equals `sewage_assets.asset_unique_id` for that company, so rows join to
assets directly with no per-catchment crosswalk:

  (A) **SWW per-year start/stop workbooks** (`sww-YYYY-edm-start-stop*.xlsx`, sheet "Data"): columns
      `Unique ID` (SBB…), `Discharge Start Date` + `Discharge Start Time`, `Discharge Stop Date` + Time.
      SWW's richer set (2020 + 2024–26) — kept as SWW's source.

  (B) **EA England-wide "Detailed EDM Start/Stop Data"** (data.gov.uk, OGL) — one file per company per
      calendar year, `Unique ID` (e.g. WXW…/… per company), `Site Name`, `Discharge Start (GMT)`,
      `Discharge End (GMT)` (ISO-8601 UTC). Covers all 10 English WaSCs → this is what makes a non-SWW
      river (Wessex et al.) get discrete spill history. Files come as yearly ZIPs (`<Year> Detailed EDM
      Start-Stop Data.zip`) holding one member per company (`<Company> YYYY Detailed EDM Data.csv/.xlsx`);
      this reader pulls the catchment company's member straight from each ZIP, or reads loose per-company
      files. Drop the ZIPs in EDM_STARTSTOP_DIR (default ~/Downloads).

We fetch the catchment's outlet ids from the live feed (by bbox) to pre-filter the company-wide file down
to this catchment before emitting SQL; the final INSERT still joins sewage_assets by asset_unique_id, so
only real catchment assets load. Idempotent on (asset_id, event_start). Source tag: 'sww-edm-history'
(SWW workbooks) / 'ea-edm-startstop' (EA detailed data). A missing data file is a clean no-op.

Usage:
  # orchestrated (setup_catchment.py): no args — globs EDM_STARTSTOP_DIR for the catchment company's files
  # manual, explicit files:
  python3 import_edm_startstop.py --config ../config/catchments/tone.json \
      "~/Downloads/2024 Detailed EDM Start-Stop Data.zip" > /tmp/tone_startstop.sql
  docker run --rm -i -e PGPASSWORD=.. postgres:16 psql -h .. -U .. -d postgres < /tmp/tone_startstop.sql
"""
import csv, glob, io, json, os, re, ssl, sys, urllib.parse, urllib.request, zipfile
from openpyxl import load_workbook

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE

# Our config company name -> the prefix(es) the EA detailed-data per-company file/member name starts
# with (the EA naming drifts year to year, e.g. "Wessex 2024 Detailed EDM Data.csv" vs "Wessex Water
# Detailed Data 2026 (1).xlsx", and Welsh is filed under "Dwr Cymru"). Fallback strips a trailing " Water".
EA_COMPANY_TOKEN = {
    "South West Water": ("South West",),
    "Wessex Water": ("Wessex",),
    "Thames Water": ("Thames",),
    "Severn Trent Water": ("Severn Trent",),
    "Anglian Water": ("Anglian",),
    "United Utilities": ("United Utilities",),
    "United Utilities Water": ("United Utilities",),
    "Yorkshire Water": ("Yorkshire",),
    "Northumbrian Water": ("Northumbrian",),
    "Southern Water": ("Southern",),
    "Dwr Cymru Welsh Water": ("Dwr Cymru", "Welsh"),
    "Welsh Water": ("Dwr Cymru", "Welsh"),
}


def ea_tokens(company):
    t = EA_COMPANY_TOKEN.get(company)
    if t:
        return tuple(x.lower() for x in t)
    return (re.sub(r"\s+Water$", "", company).strip().lower(),)


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def _s(v):
    return str(v).strip() if v is not None else ""


def feed_ids(cfg):
    """The company's outlet ids within the catchment bbox, from the live feed. outFields=* + lowercase
    attribute keys so it reads every company (SWW camelCase AND the NSOH-standard PascalCase) — same
    casing generalisation as src/lib/edm/sync.ts and import_catchment.py (NATIONAL-ONBOARDING.md §8)."""
    feed = cfg["company"]["edm_feed"]
    s, w, n, e = cfg["geo"]["bbox"]
    url = feed + "?" + urllib.parse.urlencode(
        {"where": "1=1", "outFields": "*", "returnGeometry": "false", "f": "json"})
    with urllib.request.urlopen(url, timeout=120, context=_SSL) as r:
        feats = json.load(r).get("features", [])
    ids = set()
    for f in feats:
        a = {k.lower(): v for k, v in f["attributes"].items()}
        lon, lat = a.get("longitude"), a.get("latitude")
        if lon is None or lat is None:
            continue
        if s <= lat <= n and w <= lon <= e:
            ids.add(_s(a.get("id")))
    return ids


def combine(d, t):
    if d is None:
        return None
    dd = d.date() if hasattr(d, "date") else d
    if t is None:
        ts = "00:00:00"
    elif hasattr(t, "strftime"):
        ts = t.strftime("%H:%M:%S")
    else:
        ts = str(t)
    return f"{dd} {ts}"


def _tables(name, fh):
    """Yield (header:list[str], row_iter) sections from a csv or xlsx binary stream. A CSV is one section;
    an xlsx is one section PER SHEET (the EA files split a year across month/period sheets, and the sheet
    is variously named Data/Submission/'January - April'/…, so we read every sheet, not a fixed one).
    Sniff the content, not the extension: the EA's "Thames 2024 Detailed EDM Data.csv" is an xlsx."""
    data = fh.read()
    if not data.startswith(b"PK\x03\x04"):
        text = io.TextIOWrapper(io.BytesIO(data), encoding="utf-8-sig", newline="")
        rdr = csv.reader(text)
        try:
            header = next(rdr)
        except StopIteration:
            return
        yield [_s(c).lstrip("﻿") for c in header], rdr
    else:
        # read fully into memory: a ZIP member stream isn't seekable, which openpyxl needs.
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        for sn in wb.sheetnames:
            it = wb[sn].iter_rows(values_only=True)
            try:
                header = next(it)
            except StopIteration:
                continue
            yield [_s(c).lstrip("﻿") for c in header], it
        wb.close()


def read_rows(name, fh, ids):
    """Read (uid, start, end) tuples for outlets in `ids` from one start/stop file. Auto-detects the EA
    detailed layout (`Discharge Start (GMT)` + `Discharge End|Stop (GMT)`, ISO-8601 UTC) vs the SWW
    workbook layout (separate Date + Time columns), per section/sheet; a sheet without start/stop columns
    (e.g. a notes/cover tab) is skipped. Timestamps are emitted as strings cast to timestamptz."""
    out = []
    matched_any = False
    for header, rows in _tables(name, fh):
        col = {h: i for i, h in enumerate(header)}
        ci = col.get("Unique ID")
        if ci is None:
            continue
        # Thames 2024 misspells the start column "Discharge Strat (GMT)"
        cs = col.get("Discharge Start (GMT)", col.get("Discharge Strat (GMT)"))
        if cs is not None:                           # (B) EA detailed start/stop (ISO-8601 UTC)
            matched_any = True
            ce = col.get("Discharge End (GMT)")
            if ce is None:
                ce = col.get("Discharge Stop (GMT)")  # column name drifts End<->Stop across years
            for row in rows:
                uid = _s(row[ci])
                if uid not in ids:
                    continue
                start = _s(row[cs])
                if not start:
                    continue
                end = _s(row[ce]) if ce is not None else ""
                out.append((uid, start, end or None))
        elif "Discharge Start Date" in col:          # (A) SWW workbook (separate date + time columns)
            matched_any = True
            csd = col["Discharge Start Date"]; cst = col.get("Discharge Start Time")
            ced = col.get("Discharge Stop Date"); cet = col.get("Discharge Stop Time")
            for row in rows:
                uid = _s(row[ci])
                if uid not in ids:
                    continue
                start = combine(row[csd], row[cst] if cst is not None else None)
                if not start:
                    continue
                end = combine(row[ced], row[cet] if cet is not None else None) if ced is not None else None
                out.append((uid, start, end))
    if not matched_any:
        raise SystemExit(f"{name}: no recognised start/stop sheet (need 'Unique ID' + a Discharge Start column)")
    return out


def discover_sources(cfg):
    """Return [(display_name, opener)] for this catchment's company. SWW uses its own workbooks; every
    other company uses the EA detailed-data files (loose, or members of the yearly ZIPs)."""
    company = cfg["company"]["name"]
    d = os.path.expanduser(os.environ.get("EDM_STARTSTOP_DIR", "~/Downloads"))
    src = []
    if company == "South West Water":
        for p in sorted(glob.glob(os.path.join(d, "sww-*edm*start*stop*.xlsx"))):
            src.append((os.path.basename(p), (lambda p=p: open(p, "rb"))))
        return src, "sww-edm-history"
    toks = ea_tokens(company)

    def is_company_member(fname):
        ml = os.path.basename(fname).lower()
        return (any(ml.startswith(p) for p in toks) and "detailed" in ml
                and ml.endswith((".csv", ".xlsx")))

    # loose per-company EA files
    for p in sorted(glob.glob(os.path.join(d, "*"))):
        if os.path.isfile(p) and is_company_member(p):
            src.append((os.path.basename(p), (lambda p=p: open(p, "rb"))))
    # this company's member inside each EA yearly ZIP
    for zp in sorted(set(glob.glob(os.path.join(d, "*Detailed*.zip"))
                         + glob.glob(os.path.join(d, "*Start-Stop*.zip")))):
        try:
            zf = zipfile.ZipFile(zp)
        except Exception as ex:                       # noqa: BLE001 — a bad zip is a skip, not a failure
            print(f"-- skip unreadable zip {os.path.basename(zp)}: {ex}", file=sys.stderr)
            continue
        for m in zf.namelist():
            if is_company_member(m):
                src.append((f"{os.path.basename(zp)}:{m}", (lambda zf=zf, m=m: zf.open(m))))
    return src, "ea-edm-startstop"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]; orgl = q(org) + "::uuid"
    file_args = [a for a in sys.argv[1:] if not a.startswith("--") and a != _config_arg()]

    if file_args:                                     # explicit paths (manual run)
        sources = [(os.path.basename(p), (lambda p=p: open(os.path.expanduser(p), "rb")))
                   for p in file_args]
        # tag by the first file's apparent kind
        source_tag = "sww-edm-history" if re.search(r"sww-.*start.*stop", file_args[0], re.I) \
            else "ea-edm-startstop"
    else:                                             # orchestrated: discover by company
        sources, source_tag = discover_sources(cfg)
        print(f"-- discovered {len(sources)} start/stop source(s) for {cfg['company']['name']} "
              f"in {os.path.expanduser(os.environ.get('EDM_STARTSTOP_DIR', '~/Downloads'))}",
              file=sys.stderr)

    if not sources:
        print(f"-- no EDM start/stop files for {cfg['company']['name']}; skipping (no spill_events). "
              f"EA data: data.gov.uk 'EDM storm overflow start-stop detailed data' → EDM_STARTSTOP_DIR.",
              file=sys.stderr)
        print("-- River Hub: no spill_events to load (no start/stop files found).")
        return

    ids = feed_ids(cfg)
    print(f"-- {len(ids)} outlet ids in the {cfg['river']} bbox", file=sys.stderr)
    if not ids:
        print("-- feed returned 0 outlet ids for this bbox — check the feed/casing; skipping.",
              file=sys.stderr)
        print("-- River Hub: no spill_events to load (0 outlets from feed).")
        return

    rows = []
    for name, opener in sources:
        try:
            with opener() as fh:
                recs = read_rows(name, fh, ids)
        except SystemExit:
            raise
        except Exception as ex:                       # noqa: BLE001 — a bad file is a skip, not a crash
            print(f"-- {name}: read error ({ex}); skipping this file", file=sys.stderr)
            continue
        print(f"-- {name}: {len(recs)} events matched to the catchment", file=sys.stderr)
        rows += recs

    if not rows:
        print("-- no matching events for this catchment's outlets in the file(s); skipping.",
              file=sys.stderr)
        print("-- River Hub: no spill_events to load.")
        return

    seen = {}                                         # de-dup on (uid, start)
    for uid, s, e in rows:
        seen[(uid, s)] = e
    print(f"-- {len(seen)} distinct (outlet, start) events across {len(sources)} source(s)", file=sys.stderr)

    out = [f"-- River Hub: EDM start/stop events for {cfg['river']} ({source_tag}). Idempotent.",
           "begin;",
           "create temp table _ss(unique_id text, event_start timestamptz, event_end timestamptz) on commit drop;"]
    items = list(seen.items())
    for i in range(0, len(items), 1000):
        vals = []
        for (uid, s), e in items[i:i + 1000]:
            vals.append(f"({q(uid)},'{s}'::timestamptz,{'null' if not e else chr(39)+e+chr(39)+'::timestamptz'})")
        out.append("insert into _ss values " + ",".join(vals) + ";")
    out.append(f"""insert into spill_events (organisation_id, asset_id, outlet_id, event_start, event_end, source)
  select {orgl}, a.id, x.unique_id, x.event_start, x.event_end, {q(source_tag)}
  from _ss x join sewage_assets a on a.organisation_id = {orgl} and a.asset_unique_id = x.unique_id
  on conflict (asset_id, event_start) do update set event_end = excluded.event_end, source = excluded.source;""")
    out.append(f"select 'spill_events total: ' || count(*) from spill_events where organisation_id = {orgl};")
    out.append("commit;")
    print("\n".join(out))


def _config_arg():
    a = sys.argv
    for i, v in enumerate(a):
        if v == "--config" and i + 1 < len(a):
            return a[i + 1]
    return None


if __name__ == "__main__":
    main()
