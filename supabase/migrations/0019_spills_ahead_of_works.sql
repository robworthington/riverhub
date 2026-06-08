-- River Hub — detect upstream assets that spill "ahead of the works".
-- Storm overflows are only lawful when the system is overwhelmed. If an upstream CSO / pumping
-- station discharges while the treatment works' own storm overflow (inlet SO / storm tank) stayed
-- shut, the works still had capacity — so that spill points to a network hydraulic bottleneck or a
-- premature/avoidable discharge rather than a works-capacity event.
--
-- For each upstream asset in a system, for a year, count spills on days the works was NOT
-- overflowing (within +/- p_tol_days). Day-bucketed: collect the works-active days, hash-left-join
-- the upstream events to them. Sargable date range uses the (asset_id, event_start) index.
-- SECURITY INVOKER → RLS applies. jit off (JIT compilation of this shape was pathologically slow).

drop function if exists spills_ahead_of_works(uuid, int, int);

create or replace function spills_ahead_of_works(p_system uuid, p_year int, p_tol_days int default 0)
returns table (
  asset_id   uuid,
  asset_name text,
  asset_type text,
  total      int,
  ahead      int,
  pct        int
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
    select e.asset_id, a.asset_name, a.asset_type::text as atype, e.event_start::date as day
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where a.sewage_system_id = p_system
      and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
  )
  select up.asset_id, up.asset_name, up.atype,
         count(*)::int,
         count(*) filter (where wd.day is null)::int,
         round(100.0 * count(*) filter (where wd.day is null) / count(*))::int
  from up
  left join works_days wd on wd.day = up.day
  group by up.asset_id, up.asset_name, up.atype
  order by count(*) filter (where wd.day is null) desc, count(*) desc;
$fn$;

grant execute on function spills_ahead_of_works(uuid, int, int) to authenticated;
