#!/usr/bin/env python3
"""
Backfill annual EDM spill stats from the consolidated SWW workbook (Dart-curated).

The official EA 2020 Storm-Overflow Annual Return lacked the SBB Unique IDs, so 2020 could not be
matched to assets by the standard importer. This workbook ("SWW EDM data.xlsx") has a sheet per year
(2020-2024) that *does* carry the New Unique ID + an "Affects Dart river" flag, so it lets us load the
missing 2020 aggregates (and re-load any other year if needed).

Emits idempotent SQL upserting edm_annual_stats on (organisation_id, outlet_id, year), linked to
sewage_assets by Unique ID. Columns are matched by header NAME (layout drifts), not index.

Usage:
    python3 import_edm_consolidated.py [YEAR] [path/to/SWW EDM data.xlsx] > /tmp/edm_2020.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/edm_2020.sql
"""
import sys, openpyxl

ORG = "00000000-0000-0000-0000-000000000001"
DEFAULT_PATH = "/Users/robertworthington/Downloads/SWW EDM data.xlsx"


def hours_from(v):
    if v is None or v == "":
        return None
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return None


def num(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def lit(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2020
    path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PATH

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[str(year)]
    rows = list(ws.iter_rows(values_only=True))
    header = [("" if h is None else str(h)).replace("\n", " ").strip() for h in rows[0]]

    def find(*needles):
        for i, h in enumerate(header):
            if all(n.lower() in h.lower() for n in needles):
                return i
        return None

    c_uid = find("New Unique ID")
    c_site = find("Site Name", "EA Consents")
    c_dart = find("Affects Dart")
    c_dur = find("Total Duration", "hours") or find("Total Duration")
    c_spills = find("Counted spills")
    c_rep = find("% of reporting period")
    if None in (c_uid, c_site, c_dart, c_dur, c_spills):
        sys.exit(f"Could not locate required columns: uid={c_uid} site={c_site} dart={c_dart} dur={c_dur} spills={c_spills}")

    out, n = [], 0
    out.append(f"-- River Hub: EDM annual stats {year} from consolidated SWW workbook (Dart only)")
    out.append("begin;")
    vals = []
    for r in rows[1:]:
        def g(i):
            return r[i] if i is not None and len(r) > i else None
        if str(g(c_dart)).strip().lower() != "yes":
            continue
        uid = (str(g(c_uid)).strip() if g(c_uid) is not None else "")
        if not uid or uid.lower() in ("nan", "none", "#n/a"):
            continue
        site = g(c_site)
        dur = hours_from(g(c_dur))
        spills = num(g(c_spills))
        rep = num(g(c_rep))
        vals.append(
            f"('{ORG}',(select id from sewage_assets where organisation_id='{ORG}' and asset_unique_id={lit(uid)} limit 1),"
            f"{lit(uid)},{year},{ 'NULL' if spills is None else spills },{ 'NULL' if dur is None else dur },"
            f"{ 'NULL' if rep is None else rep },{lit(site)},'sww_workbook')"
        )
        n += 1
    wb.close()

    cols = "organisation_id, asset_id, outlet_id, year, spill_count, total_duration_hours, reporting_pct, site_name, source"
    for i in range(0, len(vals), 200):
        out.append(f"insert into edm_annual_stats ({cols}) values\n  " + ",\n  ".join(vals[i:i+200])
                   + "\non conflict (organisation_id, outlet_id, year) do update set "
                     "asset_id=excluded.asset_id, spill_count=excluded.spill_count, "
                     "total_duration_hours=excluded.total_duration_hours, reporting_pct=excluded.reporting_pct, "
                     "site_name=excluded.site_name, source=excluded.source;")
    out.append("commit;")
    print("\n".join(out))
    print(f"-- {n} Dart outlets for {year}", file=sys.stderr)


if __name__ == "__main__":
    main()
