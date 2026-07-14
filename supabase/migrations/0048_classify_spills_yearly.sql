-- River Hub — per-year dry/wet spill counts for the asset spill-trend chart.
-- classify_spills returns one row per event; a high-volume asset (e.g. Kilbury SSO, >4k events)
-- exceeds PostgREST's row cap, so the client received only the most-recent ~1000 events and the
-- chart lost its older years. This aggregates the same weather classification in SQL and returns one
-- row per year (a handful of rows), so every year with events is represented regardless of volume.

create or replace function classify_spills_yearly(
  p_asset uuid,
  p_window int default 1,
  p_threshold numeric default 0.25
)
returns table (year int, dry int, wet int, unknown int)
language sql
stable
as $$
  with ev as (
    select extract(year from e.event_start)::int as yr,
           a.rainfall_station_id as sid,
           e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where e.asset_id = p_asset
  ), cls as (
    select ev.yr,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end as wc
    from ev
  )
  select yr,
    count(*) filter (where wc = 'dry')::int,
    count(*) filter (where wc = 'wet')::int,
    count(*) filter (where wc = 'unknown')::int
  from cls
  group by yr
  order by yr;
$$;

grant execute on function classify_spills_yearly(uuid, int, numeric) to authenticated;
