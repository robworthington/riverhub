#!/usr/bin/env python3
"""
Rain gauges for a Welsh catchment: step `gauges` for "nation": "wales" (WALES-ROLLOUT-PLAN.md §5). The
English step reads the EA hydrology service, which has no Welsh gauges.

Source: NRW telemetry API (api.naturalresources.wales/telemetry/api, OGL, no key). Its /measures list
has every NRW rainfall measure (148, 15-minute totals) with the latest reading time; /stations has the
locations. Same method as import_rain_gauges.py (DRY-SPILL-METHOD.md §4): take the live gauges (a reading
in the last 7 days) within the config's radius of the centre, map each overflow to its nearest gauge,
and add only the gauges some overflow uses.

An NRW gauge is stored in rainfall_stations with ea_station_id = the NRW station reference and
ea_measure_rainfall = "nrw:<measure id>". The prefix tells the hourly sync (src/lib/ea/sync.ts) and the
backfill (backfill_nrw_rain.py) to read NRW, not the EA, and to add the 15-minute totals into days.

Usage:
    python3 scripts/import_wales_rain_gauges.py --config config/catchments/teifi.json > /tmp/wgauges.sql
"""
import datetime as dt
import math
import sys

import catchment_config
import wales_common as wc

LIVE_DAYS = 7


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    clat, clon = cfg["geo"]["centre"]
    radius = cfg["geo"].get("radius_km", 20)

    stations = {s["monitoring_station_reference"]: s for s in wc.nrw_get("/stations")}
    cutoff = (dt.datetime.utcnow() - dt.timedelta(days=LIVE_DAYS)).isoformat(sep=" ")
    cands = []
    for m in wc.nrw_get("/measures"):
        if m.get("measure_type_en") != "Rainfall" or m.get("measure_status_name") != "Online":
            continue
        if (m.get("latest_time") or "") < cutoff:
            continue
        s = stations.get(m["monitoring_station_reference"])
        try:
            lat, lon = float(s["latitude"]), float(s["longitude"])
        except (TypeError, ValueError, KeyError):
            continue
        if km(clat, clon, lat, lon) <= radius:
            cands.append((s["monitoring_station_reference"], s.get("monitoring_station_name_en") or m["measure_id"],
                          lat, lon, wc.NRW_MEASURE_PREFIX + m["measure_id"]))
    print(f"-- {len(cands)} live NRW rain gauges within {radius} km of the {cfg['river']} centre", file=sys.stderr)
    if not cands:
        sys.exit("no live NRW rain gauges near the catchment")

    orgl = wc.q(org) + "::uuid"
    out = [f"-- River Hub: NRW rain gauges for {cfg['river']} (OGL). Idempotent.", "begin;",
           "create temp table _cand(station text, name text, lat float, lon float, measure text, geom geometry) "
           "on commit drop;"]
    for st, name, lat, lon, measure in cands:
        out.append(f"insert into _cand values ({wc.q(st)}, {wc.q(name)}, {lat}, {lon}, {wc.q(measure)}, "
                   f"ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326));")
    # the rest mirrors import_rain_gauges.py: nearest gauge per overflow, seed only the gauges used
    out.append(f"""create temp table _asset_gauge on commit drop as
  select a.id as asset_id, c.*
  from sewage_assets a
  cross join lateral (
    select * from _cand c
    order by ST_Distance(c.geom::geography, ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography)
    limit 1) c
  where a.organisation_id = {orgl} and a.latitude is not null;""")
    out.append(f"""insert into rainfall_stations (organisation_id, name, ea_station_id, ea_measure_rainfall, latitude,
    longitude, ea_enabled)
  select distinct {orgl}, g.name, g.station, g.measure, g.lat, g.lon, true from _asset_gauge g
  on conflict (organisation_id, ea_station_id) do update set
    name = excluded.name, ea_measure_rainfall = excluded.ea_measure_rainfall, ea_enabled = true;""")
    out.append(f"""update sewage_assets a set rainfall_station_id = rs.id
  from _asset_gauge g join rainfall_stations rs on rs.organisation_id = {orgl} and rs.ea_station_id = g.station
  where a.id = g.asset_id;""")
    out.append(f"""update rainfall_stations set ea_enabled = false
  where organisation_id = {orgl}
    and id not in (select rainfall_station_id from sewage_assets where rainfall_station_id is not null);""")
    out.append("select 'gauges used: ' || count(distinct station) from _asset_gauge;")
    out.append(f"select 'assets mapped: ' || count(*) from sewage_assets where organisation_id = {orgl} "
               f"and rainfall_station_id is not null;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
