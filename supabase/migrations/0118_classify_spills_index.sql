-- 0118: classify_spills uses the spill_events index when called for one overflow.
--
-- Both overloads filtered with `(p_asset is null or e.asset_id = p_asset)`. A SQL function is planned
-- once for any parameter value, so that predicate could never use spill_events_asset_id_event_start_idx
-- and every call read the whole table (~690 MB, ~2.4 s). Every overflow page calls it through
-- public_spill_events and public_spill_flagged, which used up the project's Disk IO budget
-- (Supabase warning, 26 Nov 2026: ~600 GB read in ~1,700 page renders).
-- Now plpgsql with a separate query for the one-overflow case: same rows, ~70 ms, ~80 blocks read.
-- The all-overflows path (p_asset null: exports, board) is unchanged.

create or replace function public.classify_spills(
  p_window integer default 1, p_threshold numeric default 0.25, p_asset uuid default null, p_year integer default null)
returns table(spill_event_id uuid, asset_id uuid, asset_name text, system_name text, event_start timestamptz,
              event_end timestamptz, ongoing boolean, duration_minutes integer, weather_class text, max_rain numeric, flow_m3s numeric)
language plpgsql stable as $function$
begin
  if p_asset is not null then
    return query
    with ev as (
      select e.id, e.asset_id, a.asset_name, sys.name as system_name,
             e.event_start, e.event_end, e.ongoing, e.duration_minutes,
             a.rainfall_station_id as sid, e.event_start::date as d
      from spill_events e
      join sewage_assets a on a.id = e.asset_id
      left join sewage_systems sys on sys.id = a.sewage_system_id
      where e.asset_id = p_asset
        and (p_year is null or extract(year from e.event_start) = p_year)
    )
    select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
      ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end,
      (select max(r.rainfall_mm) from rainfall_readings r
         where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d),
      (select fr.flow_m3s from flow_readings fr where fr.reading_date = ev.d limit 1)
    from ev
    order by ev.event_start desc;
  else
    return query
    with ev as (
      select e.id, e.asset_id, a.asset_name, sys.name as system_name,
             e.event_start, e.event_end, e.ongoing, e.duration_minutes,
             a.rainfall_station_id as sid, e.event_start::date as d
      from spill_events e
      join sewage_assets a on a.id = e.asset_id
      left join sewage_systems sys on sys.id = a.sewage_system_id
      where (p_year is null or extract(year from e.event_start) = p_year)
    )
    select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
      ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end,
      (select max(r.rainfall_mm) from rainfall_readings r
         where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d),
      (select fr.flow_m3s from flow_readings fr where fr.reading_date = ev.d limit 1)
    from ev
    order by ev.event_start desc;
  end if;
end
$function$;

create or replace function public.classify_spills(
  p_window integer, p_threshold numeric, p_asset uuid, p_year integer, p_org uuid)
returns table(spill_event_id uuid, asset_id uuid, asset_name text, system_name text, event_start timestamptz,
              event_end timestamptz, ongoing boolean, duration_minutes integer, weather_class text, max_rain numeric, flow_m3s numeric)
language plpgsql stable as $function$
begin
  if p_asset is not null then
    return query
    with ev as (
      select e.id, e.asset_id, a.asset_name, sys.name as system_name,
             e.event_start, e.event_end, e.ongoing, e.duration_minutes,
             a.rainfall_station_id as sid, e.event_start::date as d
      from spill_events e
      join sewage_assets a on a.id = e.asset_id
      left join sewage_systems sys on sys.id = a.sewage_system_id
      where e.asset_id = p_asset
        and (p_year is null or extract(year from e.event_start) = p_year)
        and (p_org is null or a.organisation_id = p_org)
    )
    select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
      ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end,
      (select max(r.rainfall_mm) from rainfall_readings r
         where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d),
      (select fr.flow_m3s from flow_readings fr where fr.reading_date = ev.d limit 1)
    from ev
    order by ev.event_start desc;
  else
    return query
    with ev as (
      select e.id, e.asset_id, a.asset_name, sys.name as system_name,
             e.event_start, e.event_end, e.ongoing, e.duration_minutes,
             a.rainfall_station_id as sid, e.event_start::date as d
      from spill_events e
      join sewage_assets a on a.id = e.asset_id
      left join sewage_systems sys on sys.id = a.sewage_system_id
      where (p_year is null or extract(year from e.event_start) = p_year)
        and (p_org is null or a.organisation_id = p_org)
    )
    select ev.id, ev.asset_id, ev.asset_name, ev.system_name,
      ev.event_start, ev.event_end, ev.ongoing, ev.duration_minutes,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end,
      (select max(r.rainfall_mm) from rainfall_readings r
         where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d),
      (select fr.flow_m3s from flow_readings fr where fr.reading_date = ev.d limit 1)
    from ev
    order by ev.event_start desc;
  end if;
end
$function$;
