#!/usr/bin/env python3
"""Backfill historical daily rainfall for the mapped gauges in DATABASE_URL's DB.

Run this AFTER import_rain_gauges.py has mapped assets -> gauges. It:
  1. reads rainfall_stations (the gauges now mapped to assets) for the org,
  2. for each gauge that lacks deep history (no readings, or earliest reading
     later than EA_FROM), pulls daily totals from the EA hydrology API and
     upserts them into rainfall_readings,
  3. leaves already-covered gauges untouched (fast no-op).

Dry-spill classification (classify_spills) needs each asset's gauge to have
readings covering the spill dates, or the spill stays 'unknown' instead of 'dry'.

    export DATABASE_URL='...'         # the target instance
    EA_FROM=2020-01-01 python3 backfill_rainfall.py     # EA_FROM optional, default 2020-01-01
    python3 backfill_rainfall.py --all                  # force refetch every gauge
"""
import os
import ssl
import sys
import json
import datetime
import urllib.parse
import urllib.request

EA_FROM = os.environ.get("EA_FROM", "2020-01-01")
FORCE_ALL = "--all" in sys.argv
BASE = "https://environment.data.gov.uk/hydrology/id/measures"
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")
import psycopg2


def fetch_readings(measure):
    """All daily readings for a measure from EA_FROM to today (paginated by date)."""
    out = {}
    cursor = EA_FROM
    today = datetime.date.today().isoformat()
    for _ in range(20):
        params = urllib.parse.urlencode({"min-date": cursor, "max-date": today, "_limit": 10000})
        req = f"{BASE}/{urllib.parse.quote(measure)}/readings?{params}"
        try:
            with urllib.request.urlopen(req, timeout=120, context=_SSL) as r:
                items = json.load(r).get("items", [])
        except Exception as e:
            print(f"  WARN {measure[:40]}: {e}", file=sys.stderr)
            break
        if not items:
            break
        for it in items:
            d = (it.get("date") or it.get("dateTime") or "")[:10]
            if d:
                out[d] = it.get("value")
        if len(items) < 10000:
            break
        cursor = max(out.keys())
    return out


conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()
cur.execute("select public_org from app_config limit 1")
org = cur.fetchone()[0]

# gauges mapped to assets, with their current earliest reading
cur.execute(
    """select rs.id, rs.ea_station_id, rs.ea_measure_rainfall, min(rr.reading_date)
       from rainfall_stations rs
       left join rainfall_readings rr on rr.station_id = rs.id
       where rs.organisation_id = %s and rs.ea_enabled
         and rs.id in (select rainfall_station_id from sewage_assets
                       where organisation_id = %s and rainfall_station_id is not null)
       group by rs.id, rs.ea_station_id, rs.ea_measure_rainfall
       order by rs.ea_station_id""",
    (org, org),
)
gauges = cur.fetchall()
from_date = datetime.date.fromisoformat(EA_FROM)
todo = [g for g in gauges if FORCE_ALL or g[3] is None or g[3] > from_date]
print(f"org {org}: {len(gauges)} mapped gauges; {len(todo)} need history from {EA_FROM}")

loaded = 0
for sid, ea_id, measure, earliest in todo:
    if not measure:
        print(f"  {ea_id}: no measure notation — skipped", file=sys.stderr)
        continue
    readings = fetch_readings(measure)
    rows = [(org, sid, d, v) for d, v in readings.items() if v is not None]
    if rows:
        cur.executemany(
            """insert into rainfall_readings (organisation_id, station_id, reading_date, rainfall_mm)
               values (%s, %s, %s, %s)
               on conflict (station_id, reading_date) do update set rainfall_mm = excluded.rainfall_mm""",
            rows,
        )
        loaded += len(rows)
    print(f"  {ea_id} (earliest was {earliest}): {len(rows)} days")

cur.execute("select count(*) from rainfall_readings where organisation_id = %s", (org,))
print(f"done: {loaded} readings upserted; rainfall_readings now {cur.fetchone()[0]} total")
conn.close()
