-- River Hub — server-side dry-spill classification (see DRY-SPILL-METHOD.md).
-- Classifies each spill_event against its asset's mapped rain gauge in the DB, so
-- we don't ship the full rainfall series to the client (and avoid PostgREST row caps).
-- SECURITY INVOKER → RLS scopes to the caller's organisation.

create or replace function classify_spills(p_window int default 1, p_threshold numeric default 0.25)
returns table (
  spill_event_id   uuid,
  asset_id         uuid,
  asset_name       text,
  system_name      text,
  event_start      timestamptz,
  event_end        timestamptz,
  ongoing          boolean,
  duration_minutes integer,
  weather_class    text,
  max_rain         numeric,
  flow_m3s         numeric
)
language sql
stable
as $$
  with ev as (
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
  )
  select
    ev.id, ev.asset_id, ev.asset_name, ev.system_name,
    ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
    case
      when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
            where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
      when (select count(distinct r.reading_date) from rainfall_readings r
            where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
      else 'unknown'
    end as weather_class,
    (select max(r.rainfall_mm) from rainfall_readings r
       where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) as max_rain,
    (select fr.flow_m3s from flow_readings fr where fr.reading_date = ev.d limit 1) as flow_m3s
  from ev
  order by ev.event_start desc;
$$;

grant execute on function classify_spills(int, numeric) to authenticated;
