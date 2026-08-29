-- Public per-event evidence dossiers (PUBLIC-SITE-REDESIGN.md). Bring the members spill-evidence
-- dossier — rainfall gauge readings, dry/wet windows, gauge proximity, severity/context — to the
-- public site. One security-definer RPC returns the raw inputs for a single event; the page reuses
-- the shared assembler (classification + confidence) so the public dossier matches the members one.
-- Also add event_id to the row RPCs so the flagged tables and event log can link to a dossier.

-- Raw inputs for one event, anon-readable, org-scoped. The derived fields (windows, per-day
-- classification, confidence, gauge distance) are computed in TS by the shared assembler.
create or replace function public_spill_evidence(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.id, e.asset_id, e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           e.event_start::date as spill_day, extract(year from e.event_start)::int as yr
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where e.id = p_event and a.organisation_id = (select public_org())
  ),
  a as (select s.* from sewage_assets s join ev on ev.asset_id = s.id),
  works as (
    select s.id from sewage_assets s
    where s.sewage_system_id = (select sewage_system_id from a)
      and s.asset_type in ('sewage_treatment_works', 'storm_tank')
  ),
  rain as (
    select jsonb_agg(jsonb_build_object('reading_date', r.reading_date, 'rainfall_mm', r.rainfall_mm) order by r.reading_date) j
    from rainfall_readings r, ev
    where r.station_id = (select rainfall_station_id from a)
      and r.reading_date between ev.spill_day - 4 and ev.spill_day
  )
  select jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'start', ev.event_start, 'end', ev.event_end, 'ongoing', ev.ongoing, 'duration_minutes', ev.duration_minutes),
    'asset', jsonb_build_object('id', a.id, 'name', a.asset_name, 'type', a.asset_type, 'unique_id', a.asset_unique_id,
                                'lat', a.latitude, 'lng', a.longitude, 'bathing_water', a.bathing_water, 'shellfish_water', a.shellfish_water),
    'system', sy.name,
    'receiving_water', wb.label,
    'parish', p.name,
    'gauge', case when g.id is null then null else jsonb_build_object('name', g.name, 'ea_station_id', g.ea_station_id, 'lat', g.latitude, 'lng', g.longitude) end,
    'daily_rain', coalesce(rain.j, '[]'::jsonb),
    'flow_m3s', fl.flow_m3s,
    'annual', case when an.asset_id is null then null else jsonb_build_object('year', ev.yr, 'spill_count', an.spill_count, 'total_duration_hours', an.total_duration_hours, 'reporting_pct', an.reporting_pct) end,
    'has_works', exists (select 1 from works),
    'works_spilled_that_day', exists (
      select 1 from spill_events se where se.asset_id in (select id from works)
        and se.event_start >= ev.spill_day::timestamptz and se.event_start < (ev.spill_day + 1)::timestamptz
    )
  )
  from ev
  join a on true
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join water_bodies wb on wb.id = a.water_body_id
  left join parishes p on p.id = a.parish_id
  left join rainfall_stations g on g.id = a.rainfall_station_id
  left join lateral (select flow_m3s from flow_readings where reading_date = ev.spill_day limit 1) fl on true
  left join lateral (select asset_id, spill_count, total_duration_hours, reporting_pct from edm_annual_stats where asset_id = ev.asset_id and year = ev.yr limit 1) an on true
  left join rain on true;
$$;

grant execute on function public_spill_evidence(uuid) to anon, authenticated;

-- Add event_id to the event log so its rows can link to the dossier (otherwise unchanged from 0056).
-- Adding a RETURNS TABLE column changes the return type, so drop + recreate (and re-grant) rather
-- than create-or-replace.
drop function if exists public_spill_events(uuid, int);
create function public_spill_events(p_asset uuid, p_year int)
returns table (event_id uuid, event_start timestamptz, event_end timestamptz, duration_minutes int, weather_class text, max_rain numeric, stw_also boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select spill_event_id, event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, p_year)
    where duration_minutes is null or duration_minutes >= 15
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and extract(year from e.event_start) = p_year group by 1
  )
  select ev.spill_event_id, ev.event_start, ev.event_end, ev.duration_minutes, ev.weather_class, ev.max_rain,
         (ev.event_start::date in (select day from wd)) as stw_also
  from ev order by ev.event_start desc;
$$;
grant execute on function public_spill_events(uuid, int) to anon, authenticated;

-- Add event_id to the flagged tables (dry + pre-STW) so their rows can link (unchanged from 0056 otherwise).
drop function if exists public_spill_flagged(uuid);
create function public_spill_flagged(p_asset uuid)
returns table (event_id uuid, kind text, event_start timestamptz, event_end timestamptz, duration_minutes int, max_rain numeric)
language sql stable security definer set search_path = public as $$
  with cl as (
    select spill_event_id, event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, null)
    where duration_minutes is null or duration_minutes >= 15
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  )
  select spill_event_id, 'dry'::text, event_start, event_end, duration_minutes, max_rain from cl where weather_class = 'dry'
  union all
  select spill_event_id, 'prestw'::text, event_start, event_end, duration_minutes, max_rain from cl where event_start::date not in (select day from wd)
  order by 3 desc;
$$;
grant execute on function public_spill_flagged(uuid) to anon, authenticated;
