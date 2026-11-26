-- 0120: classify_spills fast for a whole river as well as for one overflow.
--
-- 0118 made the one-overflow path use the index but turned the function into plpgsql, which the
-- planner can't inline, and the whole-river path stayed slow: three rainfall lookups and a river-flow
-- lookup for every spill. On the Teign (108,346 spills) the board's all-years dry-spill count took
-- ~7 s, so the live spill map (which asks for all years) passed Vercel's 10 s limit and returned 500
-- for the Teign, Dart and Hampshire Avon (26 Nov 2026).
-- Back to LANGUAGE sql (inlinable) with: a separate branch for one overflow (index, as 0118); one
-- rainfall lookup per gauge-day and one flow lookup per day, shared by every spill on it.
-- Identical rows (checked on all 108,346 Teign spills and on one overflow). Teign: 6.96 s -> 1.05 s;
-- one overflow: ~34 ms.

create or replace function public.classify_spills(
  p_window integer default 1, p_threshold numeric default 0.25, p_asset uuid default null, p_year integer default null)
returns table(spill_event_id uuid, asset_id uuid, asset_name text, system_name text, event_start timestamptz,
              event_end timestamptz, ongoing boolean, duration_minutes integer, weather_class text, max_rain numeric, flow_m3s numeric)
language sql stable as $function$
  with ev as (
    -- two branches so one overflow uses the spill_events index ((p_asset is null or ...) on asset_id can't, 0118)
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
    where p_asset is not null and e.asset_id = p_asset
      and (p_year is null or extract(year from e.event_start) = p_year)
    union all
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
    where p_asset is null
      and (p_year is null or extract(year from e.event_start) = p_year)
  ),
  -- one rainfall lookup per gauge and day, shared by every spill at that gauge that day
  rw as (
    select k.sid, k.d, x.wet, x.ndays, x.max_rain
    from (select distinct sid, d from ev where sid is not null) k
    cross join lateral (
      select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) as wet,
             count(distinct r.reading_date) as ndays, max(r.rainfall_mm) as max_rain
      from rainfall_readings r
      where r.station_id = k.sid and r.reading_date between k.d - p_window and k.d) x
  ),
  -- one river-flow lookup per day (it was one per spill)
  fl as (
    select k.d, (select fr.flow_m3s from flow_readings fr where fr.reading_date = k.d limit 1) as flow_m3s
    from (select distinct d from ev) k
  )
  select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
    ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
    case when rw.wet then 'wet' when rw.ndays = p_window + 1 then 'dry' else 'unknown' end,
    rw.max_rain, fl.flow_m3s
  from ev
  left join rw on rw.sid = ev.sid and rw.d = ev.d
  left join fl on fl.d = ev.d
  order by ev.event_start desc;
$function$;

create or replace function public.classify_spills(
  p_window integer, p_threshold numeric, p_asset uuid, p_year integer, p_org uuid)
returns table(spill_event_id uuid, asset_id uuid, asset_name text, system_name text, event_start timestamptz,
              event_end timestamptz, ongoing boolean, duration_minutes integer, weather_class text, max_rain numeric, flow_m3s numeric)
language sql stable as $function$
  with ev as (
    -- two branches so one overflow uses the spill_events index ((p_asset is null or ...) on asset_id can't, 0118)
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
    where p_asset is not null and e.asset_id = p_asset
      and (p_year is null or extract(year from e.event_start) = p_year)
      and (p_org is null or a.organisation_id = p_org)
    union all
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
    where p_asset is null
      and (p_year is null or extract(year from e.event_start) = p_year)
      and (p_org is null or a.organisation_id = p_org)
  ),
  -- one rainfall lookup per gauge and day, shared by every spill at that gauge that day
  rw as (
    select k.sid, k.d, x.wet, x.ndays, x.max_rain
    from (select distinct sid, d from ev where sid is not null) k
    cross join lateral (
      select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) as wet,
             count(distinct r.reading_date) as ndays, max(r.rainfall_mm) as max_rain
      from rainfall_readings r
      where r.station_id = k.sid and r.reading_date between k.d - p_window and k.d) x
  ),
  -- one river-flow lookup per day (it was one per spill)
  fl as (
    select k.d, (select fr.flow_m3s from flow_readings fr where fr.reading_date = k.d limit 1) as flow_m3s
    from (select distinct d from ev) k
  )
  select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
    ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
    case when rw.wet then 'wet' when rw.ndays = p_window + 1 then 'dry' else 'unknown' end,
    rw.max_rain, fl.flow_m3s
  from ev
  left join rw on rw.sid = ev.sid and rw.d = ev.d
  left join fl on fl.d = ev.d
  order by ev.event_start desc;
$function$;
