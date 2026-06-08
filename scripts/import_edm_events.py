#!/usr/bin/env python3
"""
Backfill historical per-spill EDM *events* (2021-2023) into spill_events from the granular SWW
start/stop workbooks. Enables historical dry-spill detection for those years.

The three granular files have different layouts and different site identifiers:
  2021: sheet "2021 StartStop data"      cols: Site Name | Discharge Start | Discharge End
  2022: sheet "2022 data South West..."  cols: Site Name | Discharge Start | Discharge End
  2023: sheet "in"                        cols: Unique ID (old SWW) | Site Name | Start | Stop

To match any of these to our assets we build a CROSSWALK from the consolidated workbook
(SWW EDM data.xlsx): for every Dart outlet it maps {EA name, WaSC operational name, old SWW ID,
new SBB ID} -> SBB Unique ID. Each event's identifier is normalised and looked up in that crosswalk.

The emitted SQL inserts via `INSERT ... SELECT ... JOIN sewage_assets`, so events whose SBB isn't
one of our assets (asset_id is NOT NULL) are silently dropped — no need to know our asset set here.
Idempotent: ON CONFLICT (asset_id, event_start).

Usage:
    python3 import_edm_events.py > /tmp/edm_events.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/edm_events.sql
"""
import sys, re, datetime, openpyxl

ORG = "00000000-0000-0000-0000-000000000001"
DL = "/Users/robertworthington/Downloads/"
CONSOLIDATED = DL + "SWW EDM data.xlsx"
SOURCE = "sww-edm-history"

# granular file configs: (path, sheet, id_col, name_col, start_col, end_col)
GRANULAR = [
    (DL + "South West 2021 copy.xlsx", "2021 StartStop data", None, 0, 1, 2),
    (DL + "2022 data South West Water copy.xlsx", "2022 data South West Water (1)", None, 0, 1, 2),
    (DL + "South West Water 2023 copy.xlsx", "in", 0, 1, 2, 3),
]


def norm(s):
    if s is None:
        return ""
    return " ".join(str(s).strip().upper().split())


def build_crosswalk():
    """normalised identifier -> SBB unique id, for Dart outlets, from the consolidated workbook."""
    wb = openpyxl.load_workbook(CONSOLIDATED, read_only=True, data_only=True)
    xwalk = {}
    for sheet in ["2020", "2021", "2022", "2023", "2024"]:
        ws = wb[sheet]
        rows = ws.iter_rows(values_only=True)
        next(rows)  # header
        for r in rows:
            if len(r) <= 13 or str(r[13]).strip().lower() != "yes":
                continue
            sbb = (str(r[3]).strip() if r[3] is not None else "")
            if not sbb or not sbb.upper().startswith("SBB"):
                continue
            for idx in (1, 4, 5, 3):  # EA name, old SWW id, WaSC name, SBB itself
                k = norm(r[idx]) if len(r) > idx else ""
                if k and k not in ("#N/A", "NONE", "NAN"):
                    xwalk.setdefault(k, sbb)
    wb.close()
    return xwalk


_US = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})")
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})")


def parse_dt(v):
    """Return ISO 'YYYY-MM-DD HH:MM:SS' or None. Handles datetime objects + ISO(Z) + US m/d/Y."""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    s = str(v).strip() if v is not None else ""
    if not s:
        return None
    m = _ISO.match(s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}:{m.group(5)}:{m.group(6)}"
    m = _US.match(s)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d} {int(m.group(4)):02d}:{m.group(5)}:{m.group(6)}"
    return None


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    xwalk = build_crosswalk()
    print(f"-- crosswalk: {len(xwalk)} Dart identifiers", file=sys.stderr)

    events = []  # (sbb, start_iso, end_iso)
    for path, sheet, id_col, name_col, start_col, end_col in GRANULAR:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet]
        rows = ws.iter_rows(values_only=True)
        next(rows)  # header
        total = matched = 0
        for r in rows:
            total += 1
            sbb = None
            if id_col is not None and len(r) > id_col:
                sbb = xwalk.get(norm(r[id_col]))
            if not sbb and len(r) > name_col:
                sbb = xwalk.get(norm(r[name_col]))
            if not sbb:
                continue
            start = parse_dt(r[start_col]) if len(r) > start_col else None
            end = parse_dt(r[end_col]) if len(r) > end_col else None
            if not start:
                continue
            events.append((sbb, start, end))
            matched += 1
        wb.close()
        print(f"-- {sheet}: {matched}/{total} rows matched to Dart outlets", file=sys.stderr)

    # dedupe on (sbb, start) keeping the last end seen
    dedup = {}
    for sbb, start, end in events:
        dedup[(sbb, start)] = end
    print(f"-- {len(dedup)} distinct (outlet, start) events", file=sys.stderr)

    print("-- River Hub: historical EDM spill_events backfill 2021-2023 (Dart)")
    print("begin;")
    items = list(dedup.items())
    B = 500
    for i in range(0, len(items), B):
        vals = ",\n  ".join(
            f"({lit(sbb)},{lit(start)},{ 'NULL' if end is None else lit(end) })"
            for (sbb, start), end in items[i:i+B]
        )
        print(
            f"insert into spill_events (organisation_id, asset_id, outlet_id, event_start, event_end, source)\n"
            f"select '{ORG}', a.id, a.asset_unique_id, v.start::timestamptz, v.stop::timestamptz, '{SOURCE}'\n"
            f"from (values\n  {vals}\n) v(sbb, start, stop)\n"
            f"join sewage_assets a on a.organisation_id='{ORG}' and a.asset_unique_id = v.sbb\n"
            f"on conflict (asset_id, event_start) do update set event_end = excluded.event_end, source = excluded.source;"
        )
    print("commit;")


if __name__ == "__main__":
    main()
