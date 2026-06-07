#!/usr/bin/env python3
"""
Per-asset rain-gauge mapping (see ../DRY-SPILL-METHOD.md §4).

Fetches EA rainfall stations around the catchment, keeps those with a daily
total-rainfall measure, seeds ONLY the gauges that are nearest to at least one
asset (data-driven — no hand-picking), and maps each sewage_asset to its nearest
gauge. Repeatable per river via CONFIG.

Usage:
    python3 import_rain_gauges.py > /tmp/gauges.sql
    docker exec -i supabase_db_river-hub psql -U postgres -d postgres < /tmp/gauges.sql   # local
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/gauges.sql                       # prod
Then run the EA sync (cron) so the new gauges' readings are pulled.
"""
import json, ssl, urllib.parse, urllib.request, datetime

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE

CONFIG = {
    "org_id": "00000000-0000-0000-0000-000000000001",
    "centre": (50.46, -3.74),   # Dart catchment centroid
    "radius_km": 20,
    "hydrology": "https://environment.data.gov.uk/hydrology/id",
}


def get(url):
    with urllib.request.urlopen(url, timeout=60, context=_SSL) as r:
        return json.load(r)


def daily_rainfall_measure(station_notation):
    """Return the station's daily (86400s) total-rainfall measure notation, but only
    if the gauge is LIVE (has a reading within the last 120 days). Dead/offline gauges
    are skipped so assets don't get mapped to a gauge with no data."""
    try:
        d = get(f"{CONFIG['hydrology']}/stations/{urllib.parse.quote(station_notation)}/measures")
    except Exception:
        return None
    measure = next((m.get("notation") for m in d.get("items", [])
                    if m.get("parameter") == "rainfall" and str(m.get("period")) == "86400"), None)
    if not measure:
        return None
    # liveness check
    try:
        r = get(f"{CONFIG['hydrology']}/measures/{urllib.parse.quote(measure)}/readings?latest")
        items = r.get("items", [])
        if not items:
            return None
        last = (items[0].get("date") or items[0].get("dateTime") or "")[:10]
        cutoff = (datetime.date.today() - datetime.timedelta(days=120)).isoformat()
        if not last or last < cutoff:
            return None
    except Exception:
        return None
    return measure


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    cfg = CONFIG
    lat, lon = cfg["centre"]
    stations = get(f"{cfg['hydrology']}/stations?observedProperty=rainfall&lat={lat}&long={lon}&dist={cfg['radius_km']}&_limit=80").get("items", [])
    cands = []
    for s in stations:
        notation, slat, slon = s.get("notation"), s.get("lat"), s.get("long")
        if not notation or slat is None or slon is None:
            continue
        measure = daily_rainfall_measure(notation)
        if measure:
            cands.append((notation, s.get("label") or notation, float(slat), float(slon), measure))
    print(f"-- {len(cands)} candidate gauges with a daily rainfall measure (of {len(stations)} nearby)")

    org = q(cfg["org_id"]) + "::uuid"
    print("begin;")
    print("create temp table _cand(ea_station_id text, name text, lat float, lon float, measure text, geom geometry) on commit drop;")
    for (notation, label, slat, slon, measure) in cands:
        print(f"insert into _cand values ({q(notation)},{q(label)},{slat},{slon},{q(measure)},"
              f"st_setsrid(st_makepoint({slon},{slat}),4326));")

    # nearest candidate gauge per asset (geography distance)
    print(f"""create temp table _asset_gauge on commit drop as
  select a.id as asset_id, c.ea_station_id, c.name, c.lat, c.lon, c.measure
  from sewage_assets a
  cross join lateral (
     select * from _cand c
     where a.latitude is not null
     order by st_distance(c.geom::geography, st_setsrid(st_makepoint(a.longitude,a.latitude),4326)::geography)
     limit 1
  ) c
  where a.organisation_id={org};""")

    # seed only the gauges actually used (nearest to >=1 asset)
    print(f"""insert into rainfall_stations (organisation_id, name, ea_station_id, ea_measure_rainfall, latitude, longitude, ea_enabled)
  select distinct {org}, g.name, g.ea_station_id, g.measure, g.lat, g.lon, true
  from _asset_gauge g
  on conflict (organisation_id, ea_station_id) do update set
     ea_measure_rainfall = excluded.ea_measure_rainfall, ea_enabled = true;""")

    # map each asset to its gauge's rainfall_stations row
    print(f"""update sewage_assets a set rainfall_station_id = rs.id
  from _asset_gauge g
  join rainfall_stations rs on rs.organisation_id={org} and rs.ea_station_id = g.ea_station_id
  where a.id = g.asset_id;""")

    # stop polling gauges no longer mapped to any asset (e.g. previously-mapped dead gauges)
    print(f"""update rainfall_stations set ea_enabled = false
  where organisation_id={org}
    and id not in (select rainfall_station_id from sewage_assets where rainfall_station_id is not null);""")

    print("select 'gauges used: ' || count(distinct ea_station_id) from _asset_gauge;")
    print("select 'assets mapped: ' || count(*) from sewage_assets where rainfall_station_id is not null and organisation_id=" + org + ";")
    print("commit;")


if __name__ == "__main__":
    main()
