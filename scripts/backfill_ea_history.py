#!/usr/bin/env python3
"""
Backfill historical EA rainfall + river-flow readings so older spill events become
classifiable for dry-spill detection (the daily cron only pulls a rolling 30 days).

Reads gauge measure notations (exported from the DB, keyed by EA station id so the
SQL is portable across local + prod) and emits idempotent upsert SQL.

Prereqs (export from DB):
  rainfall: ea_station_id|measure   -> /tmp/rain_gauges.txt
  flow:     ea_station_id|flowMeasure|levelMeasure -> /tmp/flow_gauges.txt

Usage:
  python3 backfill_ea_history.py > /tmp/backfill.sql
  docker exec -i supabase_db_river-hub psql -U postgres -d postgres < /tmp/backfill.sql   # local
  docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/backfill.sql                       # prod
"""
import json, os, shutil, ssl, subprocess, urllib.parse, urllib.request, datetime

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
import catchment_config

ORG = catchment_config.load()["org_id"]
FROM_DATE = os.environ.get("EA_FROM", "2024-01-01")  # e.g. EA_FROM=2021-01-01 for historical backfill
BASE = "https://environment.data.gov.uk/hydrology/id/measures"
RAIN_FILE = "/tmp/rain_gauges.txt"
FLOW_FILE = "/tmp/flow_gauges.txt"


def fetch_readings(measure):
    """All daily readings for a measure from FROM_DATE to today (paginated by date)."""
    out = {}
    cursor = FROM_DATE
    today = datetime.date.today().isoformat()
    for _ in range(20):  # safety bound on pagination loops
        params = urllib.parse.urlencode({"min-date": cursor, "max-date": today, "_limit": 10000})
        url = f"{BASE}/{urllib.parse.quote(measure)}/readings?{params}"
        try:
            with urllib.request.urlopen(url, timeout=120, context=_SSL) as r:
                items = json.load(r).get("items", [])
        except Exception as e:
            print(f"-- WARN {measure[:40]}: {e}")
            break
        if not items:
            break
        for it in items:
            d = (it.get("date") or it.get("dateTime") or "")[:10]
            if d:
                out[d] = it.get("value")
        if len(items) < 10000:
            break
        cursor = max(out.keys())  # next page from last date seen
    return out


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def numlit(v):
    return "null" if v is None else repr(float(v))


def _psql_lines(sql):
    """Read pipe-joined rows from the DB via local or dockerised psql (DB_URL from env)."""
    db = os.environ.get("DB_URL")
    if not db:
        return None
    if shutil.which("psql"):
        cmd = ["psql", db, "-qAt", "-c", sql]
    else:
        local = "127.0.0.1" in db or "localhost" in db
        cmd = ["docker", "run", "--rm", "-i"] + (["--network", "host"] if local else []) + \
              ["postgres:16", "psql", db, "-qAt", "-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"backfill: psql read failed: {r.stderr.strip()[-300:]}")
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def load_gauges():
    """Gauge measure lists for the org. Prefer the legacy /tmp files if present (back-compat), else read
    the catchment's registered gauges straight from the DB — so an orchestrated run needs no manual export."""
    if os.path.exists(RAIN_FILE):
        rain = [l.strip().split("|") for l in open(RAIN_FILE) if l.strip()]
    else:
        lines = _psql_lines(
            f"select ea_station_id||'|'||ea_measure_rainfall from rainfall_stations "
            f"where organisation_id='{ORG}' and ea_measure_rainfall is not null and ea_enabled")
        rain = [ln.split("|") for ln in (lines or [])]
    if os.path.exists(FLOW_FILE):
        flow = [l.strip().split("|") for l in open(FLOW_FILE) if l.strip()]
    else:
        lines = _psql_lines(
            f"select ea_station_id||'|'||coalesce(ea_measure_flow,'')||'|'||coalesce(ea_measure_level,'') "
            f"from river_gauges where organisation_id='{ORG}' and ea_enabled")
        flow = [ln.split("|") for ln in (lines or [])]
    return rain, flow


def main():
    rain, flow = load_gauges()
    org = q(ORG) + "::uuid"

    print(f"-- EA history backfill from {FROM_DATE}")
    print("begin;")

    # ---- rainfall ----
    print("create temp table _rain(ea_station_id text, reading_date date, mm numeric) on commit drop;")
    total = 0
    for ea_id, measure in rain:
        readings = fetch_readings(measure)
        total += len(readings)
        print(f"-- rain {ea_id[:30]}: {len(readings)} days")
        for d, v in readings.items():
            print(f"insert into _rain values ({q(ea_id)},'{d}',{numlit(v)});")
    print(f"""insert into rainfall_readings (organisation_id, station_id, reading_date, rainfall_mm)
  select {org}, rs.id, x.reading_date, x.mm
  from _rain x join rainfall_stations rs on rs.organisation_id={org} and rs.ea_station_id = x.ea_station_id
  on conflict (station_id, reading_date) do update set rainfall_mm = excluded.rainfall_mm;""")

    # ---- flow + level ----
    print("create temp table _flow(ea_station_id text, reading_date date, flow numeric, level numeric) on commit drop;")
    for parts in flow:
        ea_id = parts[0]; flow_m = parts[1] if len(parts) > 1 else ""; level_m = parts[2] if len(parts) > 2 else ""
        fvals = fetch_readings(flow_m) if flow_m else {}
        lvals = fetch_readings(level_m) if level_m else {}
        dates = set(fvals) | set(lvals)
        print(f"-- flow {ea_id[:30]}: {len(dates)} days")
        for d in sorted(dates):
            print(f"insert into _flow values ({q(ea_id)},'{d}',{numlit(fvals.get(d))},{numlit(lvals.get(d))});")
    print(f"""insert into flow_readings (organisation_id, gauge_id, reading_date, flow_m3s, level_m)
  select {org}, g.id, x.reading_date, x.flow, x.level
  from _flow x join river_gauges g on g.organisation_id={org} and g.ea_station_id = x.ea_station_id
  on conflict (gauge_id, reading_date) do update set flow_m3s = excluded.flow_m3s, level_m = excluded.level_m;""")

    print("select 'rainfall_readings total: ' || count(*) from rainfall_readings;")
    print("select 'flow_readings total: ' || count(*) from flow_readings;")
    print("commit;")


if __name__ == "__main__":
    main()
