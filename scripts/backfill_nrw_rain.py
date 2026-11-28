#!/usr/bin/env python3
"""
Daily rainfall history for a Welsh catchment's NRW gauges: step `ea-backfill` for "nation": "wales"
(WALES-ROLLOUT-PLAN.md §5). Dry-spill detection compares each spill with the rainfall at the overflow's
gauge, so the gauges need readings back to the first spill to classify.

Reads the catchment's NRW gauges (rainfall_stations rows whose measure starts "nrw:", added by
import_wales_rain_gauges.py) from the database via DB_URL, fetches their 15-minute totals from the NRW
telemetry API and adds them into days (wales_common.nrw_daily_rainfall: UTC days, days with gaps left
out). NRW's history starts in early 2024; Welsh spill events start with River Hub's own hourly
snapshots (28 Nov 2026), so that is enough. The hourly sync keeps the last 30 days current.

Env:  EA_FROM  earliest date (default 2024-01-01; shared with the EA backfill)
      DB_URL   to read the gauge list
Usage:
    DB_URL=… python3 scripts/backfill_nrw_rain.py --config config/catchments/teifi.json > /tmp/wrain.sql
"""
import datetime as dt
import os
import sys

import catchment_config
import wales_common as wc
from backfill_ea_history import _psql_lines

FROM = max(os.environ.get("EA_FROM", "2024-01-01"), "2024-01-01")


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    lines = _psql_lines(
        f"select ea_station_id || '|' || ea_measure_rainfall from rainfall_stations "
        f"where organisation_id = '{org}' and ea_enabled and ea_measure_rainfall like '{wc.NRW_MEASURE_PREFIX}%'")
    if lines is None:
        sys.exit("DB_URL is not set (needed to read the catchment's gauges)")
    gauges = [ln.split("|", 1) for ln in lines]
    if not gauges:
        sys.exit(f"no NRW rain gauges for {cfg['river']}: run the gauges step first")
    today = dt.datetime.utcnow().date().isoformat()

    orgl = wc.q(org) + "::uuid"
    out = [f"-- River Hub: NRW daily rainfall for {cfg['river']} from {FROM} (OGL). Idempotent.", "begin;",
           "create temp table _rain(station text, reading_date date, mm numeric) on commit drop;"]
    total = 0
    for station, measure in gauges:
        days = wc.nrw_daily_rainfall(measure[len(wc.NRW_MEASURE_PREFIX):], FROM, today)
        total += len(days)
        print(f"-- {station}: {len(days)} days", file=sys.stderr)
        rows = [f"({wc.q(station)}, '{d}', {mm})" for d, mm in sorted(days.items())]
        for i in range(0, len(rows), 1000):
            out.append("insert into _rain values " + ",".join(rows[i:i + 1000]) + ";")
    out.append(f"""insert into rainfall_readings (organisation_id, station_id, reading_date, rainfall_mm)
  select {orgl}, rs.id, x.reading_date, x.mm
  from _rain x join rainfall_stations rs on rs.organisation_id = {orgl} and rs.ea_station_id = x.station
  on conflict (station_id, reading_date) do update set rainfall_mm = excluded.rainfall_mm;""")
    out.append(f"select 'NRW rainfall days: ' || count(*) from rainfall_readings rr join rainfall_stations rs "
               f"on rs.id = rr.station_id where rs.organisation_id = {orgl};")
    out.append("commit;")
    print(f"-- {total} gauge-days from {len(gauges)} gauges", file=sys.stderr)
    print("\n".join(out))


if __name__ == "__main__":
    main()
