-- River Hub — individual "ahead of the works" spill events (dates), companion to the per-asset
-- summary in 0019. Returns each upstream spill that occurred on a day the works was NOT overflowing
-- (within +/- p_tol_days), most-recent first. Capped at 2000 rows. SECURITY INVOKER → RLS applies.

create or replace function spills_ahead_of_works_events(p_system uuid, p_year int, p_tol_days int default 0)
returns table (
  asset_id         uuid,
  asset_name       text,
  asset_type       text,
  event_start      timestamptz,
  event_end        timestamptz,
  duration_minutes int
)
language sql
stable
set jit = off
as $fn$
  with works_days as (
    select distinct gd::date as day
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    cross join lateral generate_series(
      e.event_start::date - p_tol_days, coalesce(e.event_end, e.event_start)::date + p_tol_days, interval '1 day'
    ) gd
    where a.sewage_system_id = p_system
      and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
  ),
  up as (
    select e.asset_id, a.asset_name, a.asset_type::text as atype,
           e.event_start, e.event_end, e.duration_minutes, e.event_start::date as day
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where a.sewage_system_id = p_system
      and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
  )
  select up.asset_id, up.asset_name, up.atype, up.event_start, up.event_end, up.duration_minutes
  from up
  left join works_days wd on wd.day = up.day
  where wd.day is null
  order by up.event_start desc
  limit 2000;
$fn$;

grant execute on function spills_ahead_of_works_events(uuid, int, int) to authenticated;
