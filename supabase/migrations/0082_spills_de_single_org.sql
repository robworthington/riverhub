-- Phase 1 workstream B — de-single-org the SPILLS section (UK-PLATFORM-SPEC / PHASE-1-PLAN).
--
-- Makes every public spills RPC resolve its organisation explicitly instead of from the single-row
-- public_org()/app_config, so the section renders river-aware under /r/<slug> on a multi-org national
-- DB. Two patterns, both additive / backward-compatible:
--
--  * ORG-WIDE LIST RPCs  -> a new `p_org uuid` overload (same body with the org sourced from p_org),
--    with the original no-arg/legacy version redefined to delegate via (select public_org()). Instance
--    mode is therefore byte-for-byte unchanged; national routes call the p_org overload.
--  * ID-SCOPED DETAIL RPCs (by asset/system/event UUID) -> the public_org() filter was only a
--    single-tenant guard: the id is already a unique key, so we either drop the redundant filter or
--    derive the org FROM the id's own row (organisation_id from sewage_assets/sewage_systems). Same
--    signature, no call-site change, identical results on a single-org DB, correct on a multi-org DB.
--
-- Shared helpers (classify_spills, dry_spill_summary, public_spills_latest_full_year) gain p_org-aware
-- forms so the dry-spill chain is org-scoped too. public_spills_problems(p_org) (added in 0081) is
-- re-issued to use them, closing the spike's "dependencies still read public_org()" caveat.
--
-- Append-only: no object is dropped; the "apply full sequence -> clean empty instance" property holds.

-- =============================================================================================
-- A. Shared helpers — p_org-aware forms
-- =============================================================================================

-- classify_spills: p_org is REQUIRED on the overload (a defaulted 5th arg would make the existing
-- 4-arg calls ambiguous). Filters the event set to one org when resolving dry/wet classification.
create or replace function classify_spills(
  p_window int, p_threshold numeric, p_asset uuid, p_year int, p_org uuid
)
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
language sql stable as $$
  with ev as (
    select e.id, e.asset_id, a.asset_name, sys.name as system_name,
           e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    left join sewage_systems sys on sys.id = a.sewage_system_id
    where (p_asset is null or e.asset_id = p_asset)
      and (p_year  is null or extract(year from e.event_start) = p_year)
      and (p_org   is null or a.organisation_id = p_org)
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

-- dry_spill_summary: p_org-aware overload (p_org required, to avoid 4-arg ambiguity); threads p_org
-- into classify_spills.
create or replace function dry_spill_summary(
  p_window int, p_threshold numeric, p_year int, p_min_minutes int, p_org uuid
)
returns table (
  asset_id    uuid,
  asset_name  text,
  system_name text,
  dry         int,
  wet         int,
  unknown     int,
  total       int
)
language sql stable as $$
  select c.asset_id, c.asset_name, c.system_name,
         count(*) filter (where c.weather_class = 'dry')::int,
         count(*) filter (where c.weather_class = 'wet')::int,
         count(*) filter (where c.weather_class = 'unknown')::int,
         count(*)::int
  from classify_spills(p_window, p_threshold, null, p_year, p_org) c
  where p_min_minutes <= 0 or c.duration_minutes is null or c.duration_minutes >= p_min_minutes
  group by c.asset_id, c.asset_name, c.system_name
  order by count(*) filter (where c.weather_class = 'dry') desc, count(*) desc;
$$;

-- public_spills_latest_full_year: p_org overload + original delegates.
create or replace function public_spills_latest_full_year(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select max(yr) from (
    select distinct extract(year from event_start)::int yr from spill_events
    where organisation_id = p_org and extract(year from event_start) < extract(year from now())
  ) y;
$$;
create or replace function public_spills_latest_full_year()
returns int language sql stable security definer set search_path = public as $$
  select public_spills_latest_full_year((select public_org()));
$$;
grant execute on function public_spills_latest_full_year(uuid) to anon, authenticated;

-- =============================================================================================
-- B. Org-wide LIST RPCs — p_org overload + legacy delegation
-- =============================================================================================

-- public_eo_summary ---------------------------------------------------------------------------
create or replace function public_eo_summary(p_org uuid)
returns table (
  eo_count int, active_count int, lfy int, hours_lfy numeric, worst_name text, worst_hours numeric
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  lfy as (select max(year) as y from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year),
  lfy_rows as (
    select eo.overflow_name, s.duration_hours
    from eo_annual_spills s join emergency_overflows eo on eo.id = s.emergency_overflow_id
    where s.organisation_id = (select id from org) and s.monitored and s.year = (select y from lfy)
  )
  select
    (select count(*)::int from emergency_overflows where organisation_id = (select id from org)),
    (select count(*)::int from lfy_rows where duration_hours > 0),
    (select y from lfy),
    (select coalesce(sum(duration_hours), 0) from lfy_rows),
    (select overflow_name from lfy_rows order by duration_hours desc limit 1),
    (select coalesce(max(duration_hours), 0) from lfy_rows);
$$;
create or replace function public_eo_summary()
returns table (
  eo_count int, active_count int, lfy int, hours_lfy numeric, worst_name text, worst_hours numeric
)
language sql stable security definer set search_path = public as $$
  select * from public_eo_summary((select public_org()));
$$;
grant execute on function public_eo_summary(uuid) to anon, authenticated;

-- public_spill_year_range ---------------------------------------------------------------------
create or replace function public_spill_year_range(p_org uuid)
returns table (min_year int, max_year int)
language sql stable security definer set search_path = public as $$
  select min(extract(year from event_start))::int, max(extract(year from event_start))::int
  from spill_events where organisation_id = p_org;
$$;
create or replace function public_spill_year_range()
returns table (min_year int, max_year int)
language sql stable security definer set search_path = public as $$
  select * from public_spill_year_range((select public_org()));
$$;
grant execute on function public_spill_year_range(uuid) to anon, authenticated;

-- public_spills_board -------------------------------------------------------------------------
create or replace function public_spills_board(p_org uuid, p_year int)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry int, wet int, total int, pre_stw int,
  last_spill_end timestamptz,
  counted int
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  latest_snap as (
    select distinct on (asset_id) asset_id, status, status_start, latest_event_start, latest_event_end, captured_at as last_updated
    from edm_snapshots where organisation_id = (select id from org) order by asset_id, captured_at desc
  ),
  ds as (select asset_id, dry, wet, total from dry_spill_summary(1, 0.25, p_year, 15, p_org)),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and (p_year is null or (e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)))
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and (p_year is null or (e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)))
  ),
  pre as (select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw from up left join works_days wd on wd.sys = up.sys and wd.day = up.day group by up.asset_id),
  last_real as (
    select e.asset_id, max(e.event_end) as last_spill_end
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and e.event_end is not null and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by e.asset_id
  )
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         ls.status, ls.status_start, ls.latest_event_start, ls.latest_event_end, ls.last_updated,
         coalesce(ds.dry, 0), coalesce(ds.wet, 0), coalesce(ds.total, 0), coalesce(pre.pre_stw, 0),
         lr.last_spill_end,
         case when p_year is null then ea_counted_spills_total(a.id) else ea_counted_spills(a.id, p_year) end
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  left join last_real lr on lr.asset_id = a.id
  where a.organisation_id = (select id from org) and (ls.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;
create or replace function public_spills_board(p_year int)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry int, wet int, total int, pre_stw int,
  last_spill_end timestamptz,
  counted int
)
language sql stable security definer set search_path = public as $$
  select * from public_spills_board((select public_org()), p_year);
$$;
grant execute on function public_spills_board(uuid, int) to anon, authenticated;

-- public_spills_repeat_offenders --------------------------------------------------------------
create or replace function public_spills_repeat_offenders(p_org uuid)
returns table (asset_id uuid, asset_name text, asset_code text, years int, total_dry int)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  rng as (
    select min(extract(year from event_start))::int lo, max(extract(year from event_start))::int hi
    from spill_events where organisation_id = (select id from org)
  ),
  yrs as (select generate_series(lo, hi) as y from rng),
  per as (
    select s.asset_id, yrs.y, s.dry
    from yrs cross join lateral dry_spill_summary(1, 0.25, yrs.y, 15, p_org) s
    where s.dry > 0
  ),
  agg as (
    select asset_id, count(distinct y)::int years, sum(dry)::int total_dry
    from per group by asset_id having count(distinct y) >= 2
  )
  select a.id, a.asset_name, a.asset_unique_id, agg.years, agg.total_dry
  from agg join sewage_assets a on a.id = agg.asset_id
  where a.organisation_id = (select id from org)
  order by agg.years desc, agg.total_dry desc;
$$;
create or replace function public_spills_repeat_offenders()
returns table (asset_id uuid, asset_name text, asset_code text, years int, total_dry int)
language sql stable security definer set search_path = public as $$
  select * from public_spills_repeat_offenders((select public_org()));
$$;
grant execute on function public_spills_repeat_offenders(uuid) to anon, authenticated;

-- public_spills_works -------------------------------------------------------------------------
create or replace function public_spills_works(p_org uuid)
returns table (
  system_id uuid, system_name text, works_asset_id uuid, works_name text,
  population int, permit_dwf numeric, demand_central numeric, load_pct int,
  verdict text, has_monitor boolean, works_hours int, upstream_count int, pre_stw_count int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  lfy as (select public_spills_latest_full_year(p_org) as y),
  works as (
    select distinct on (a.sewage_system_id) a.sewage_system_id as sys, a.id as works_id, a.asset_name as works_name
    from sewage_assets a
    where a.organisation_id = (select id from org) and a.asset_type = 'sewage_treatment_works'
    order by a.sewage_system_id, a.asset_name
  ),
  works_assets as (
    select a.sewage_system_id as sys, a.id
    from sewage_assets a
    where a.organisation_id = (select id from org) and a.asset_type in ('sewage_treatment_works', 'storm_tank')
  ),
  works_hours as (
    select wa.sys, round(sum(coalesce(e.duration_minutes, 0)) / 60.0)::int hours
    from works_assets wa join spill_events e on e.asset_id = wa.id
    where (e.duration_minutes is null or e.duration_minutes >= 15)
      and extract(year from e.event_start) = (select y from lfy)
    group by wa.sys
  ),
  works_days as (
    select wa.sys, e.event_start::date as day
    from works_assets wa join spill_events e on e.asset_id = wa.id
    where (e.duration_minutes is null or e.duration_minutes >= 15)
    group by wa.sys, e.event_start::date
  ),
  monitor as (
    select distinct wa.sys from works_assets wa
    where exists (select 1 from spill_events e where e.asset_id = wa.id)
       or exists (select 1 from edm_snapshots s where s.asset_id = wa.id)
  ),
  upstream as (
    select a.sewage_system_id as sys, a.id as asset_id, e.event_start::date as day
    from sewage_assets a join spill_events e on e.asset_id = a.id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
  ),
  upstream_count as (
    select a.sewage_system_id as sys, count(distinct a.id)::int n
    from sewage_assets a
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
    group by a.sewage_system_id
  ),
  pre as (
    select up.sys, count(*) filter (where wd.day is null)::int pre_stw
    from upstream up left join works_days wd on wd.sys = up.sys and wd.day = up.day
    group by up.sys
  ),
  cap as (
    select v.system_id, v.effective_population, v.demand_central_m3d
    from system_capacity_v v where v.organisation_id = (select id from org)
  ),
  latest_permit as (
    select distinct on (asset_id) asset_id, permit_dwf_m3d
    from asset_permits order by asset_id, created_at desc
  ),
  permit as (
    select w.sys, lp.permit_dwf_m3d
    from works w join latest_permit lp on lp.asset_id = w.works_id
  ),
  calc as (
    select
      w.sys, sy.name as system_name, w.works_id, w.works_name,
      cap.effective_population::int as population,
      pm.permit_dwf_m3d as permit_dwf,
      cap.demand_central_m3d as demand_central,
      (mon.sys is not null) as has_monitor,
      coalesce(wh.hours, 0) as works_hours,
      coalesce(uc.n, 0) as upstream_count,
      coalesce(pre.pre_stw, 0) as pre_stw_count
    from works w
    join sewage_systems sy on sy.id = w.sys
    left join cap on cap.system_id = w.sys
    left join permit pm on pm.sys = w.sys
    left join works_hours wh on wh.sys = w.sys
    left join monitor mon on mon.sys = w.sys
    left join upstream_count uc on uc.sys = w.sys
    left join pre on pre.sys = w.sys
  ),
  derived as (
    select c.*,
      (c.population is not null and c.population > 0 and c.permit_dwf is not null
        and c.permit_dwf > 0 and c.demand_central is not null) as capacity_known,
      case when c.population is not null and c.population > 0 and c.permit_dwf is not null
                and c.permit_dwf > 0 and c.demand_central is not null
           then round(c.demand_central / c.permit_dwf * 100)::int end as load_pct
    from calc c
  )
  select
    sys, system_name, works_id, works_name, population, permit_dwf, demand_central, load_pct,
    case
      when not capacity_known then 'not_assessed'
      when load_pct > 100 then 'over'
      when load_pct >= 95 then 'limit'
      else 'within'
    end as verdict,
    has_monitor, works_hours, upstream_count, pre_stw_count,
    case
      when (capacity_known and load_pct >= 95 and works_hours > 0) and pre_stw_count >= 4 then 'both'
      when (capacity_known and load_pct >= 95 and works_hours > 0) then 'capacity'
      when pre_stw_count >= 4 then 'upstream'
      when not capacity_known then 'not_assessed'
      else 'none'
    end as diagnosis
  from derived
  order by (not capacity_known), load_pct desc nulls last;
$$;
create or replace function public_spills_works()
returns table (
  system_id uuid, system_name text, works_asset_id uuid, works_name text,
  population int, permit_dwf numeric, demand_central numeric, load_pct int,
  verdict text, has_monitor boolean, works_hours int, upstream_count int, pre_stw_count int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  select * from public_spills_works((select public_org()));
$$;
grant execute on function public_spills_works(uuid) to anon, authenticated;

-- public_spill_pins ---------------------------------------------------------------------------
create or replace function public_spill_pins(p_org uuid)
returns table (
  asset_id uuid, asset_name text, lat double precision, lng double precision,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  last_spill_end timestamptz
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  snap as (
    select distinct on (asset_id)
           asset_id, status, status_start, latest_event_start, latest_event_end, coalesce(last_updated, captured_at) lu
    from edm_snapshots where organisation_id = (select id from org)
    order by asset_id, captured_at desc
  ),
  last_real as (
    select e.asset_id, max(e.event_end) as last_spill_end
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and e.event_end is not null and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by e.asset_id
  )
  select a.id, a.asset_name, a.latitude, a.longitude,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu,
         lr.last_spill_end
  from sewage_assets a
  join snap s on s.asset_id = a.id
  left join last_real lr on lr.asset_id = a.id
  where a.organisation_id = (select id from org)
    and a.latitude is not null and a.longitude is not null;
$$;
create or replace function public_spill_pins()
returns table (
  asset_id uuid, asset_name text, lat double precision, lng double precision,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  last_spill_end timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from public_spill_pins((select public_org()));
$$;
grant execute on function public_spill_pins(uuid) to anon, authenticated;

-- public_spills_reduction ---------------------------------------------------------------------
create or replace function public_spills_reduction(p_org uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, system_name text,
  baseline_year int, baseline int, latest_year int, latest int, latest_events int,
  pct_change int, x_cap numeric, deadline text, verdict text, series jsonb
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  lfy as (select public_spills_latest_full_year(p_org) as y),
  ay as (
    select distinct asset_id, extract(year from event_start)::int as yr
    from spill_events where organisation_id = (select id from org)
  ),
  py as (
    select ay.asset_id, ay.yr, ea_counted_spills(ay.asset_id, ay.yr) as n
    from ay
  ),
  ev as (
    select asset_id, extract(year from event_start)::int as yr,
      count(*) filter (where duration_minutes is null or duration_minutes >= 15)::int as n
    from spill_events where organisation_id = (select id from org)
    group by 1, 2
  ),
  agg as (
    select asset_id,
      jsonb_agg(jsonb_build_object('year', yr, 'count', n) order by yr) as series,
      min(yr) as first_yr,
      (array_agg(n order by yr))[1] as first_n
    from py where yr <= (select y from lfy) group by asset_id
  ),
  base_latest as (
    select a.asset_id, a.series,
      case when exists (select 1 from py where py.asset_id = a.asset_id and yr = 2020) then 2020 else a.first_yr end as baseline_year,
      coalesce((select n from py where py.asset_id = a.asset_id and yr = 2020), a.first_n) as baseline,
      (select y from lfy) as latest_year,
      coalesce((select n from py where py.asset_id = a.asset_id and yr = (select y from lfy)), 0) as latest,
      coalesce((select n from ev where ev.asset_id = a.asset_id and yr = (select y from lfy)), 0) as latest_events
    from agg a
  )
  select bl.asset_id, sa.asset_name, sa.asset_unique_id, sy.name,
    bl.baseline_year, bl.baseline, bl.latest_year, bl.latest, bl.latest_events,
    case when bl.baseline > 0 then round((bl.latest - bl.baseline)::numeric / bl.baseline * 100)::int end as pct_change,
    round(bl.latest / 10.0, 1) as x_cap,
    coalesce(sa.sodrp_deadline, '2050') as deadline,
    case when bl.latest <= 10 then 'within'
         when bl.baseline is not null and bl.latest > bl.baseline then 'rising' else 'falling' end as verdict,
    bl.series
  from base_latest bl
  join sewage_assets sa on sa.id = bl.asset_id
  left join sewage_systems sy on sy.id = sa.sewage_system_id
  where bl.baseline is not null or bl.latest > 0
  order by bl.latest desc, x_cap desc;
$$;
create or replace function public_spills_reduction()
returns table (
  asset_id uuid, asset_name text, asset_code text, system_name text,
  baseline_year int, baseline int, latest_year int, latest int, latest_events int,
  pct_change int, x_cap numeric, deadline text, verdict text, series jsonb
)
language sql stable security definer set search_path = public as $$
  select * from public_spills_reduction((select public_org()));
$$;
grant execute on function public_spills_reduction(uuid) to anon, authenticated;

-- public_spills_measures ----------------------------------------------------------------------
create or replace function public_spills_measures(p_org uuid)
returns table (
  id uuid, action_ref text, action_component text, cycle text, driver_code text, driver_label text,
  driver_obligation text, action_name text, action_description text, completion_date date, complete boolean,
  wb_name text, attached_name text, attached_kind text, attached_count int,
  action_type text, permit_ref text
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  linkcount as (select winep_action_id, count(*)::int n from winep_asset_links group by winep_action_id)
  select w.id, w.action_id, w.action_component, w.cycle, w.driver_code, w.driver_label,
    w.driver_obligation, w.action_name, w.action_description, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    w.wb_name,
    coalesce(a.asset_name, sy.name) as attached_name,
    case when w.asset_id is not null then 'asset'
         when w.sewage_system_id is not null then 'works'
         when w.wb_name is not null then 'waterbody' else 'none' end as attached_kind,
    (coalesce(lc.n, 0) + case when w.asset_id is not null then 1 else 0 end) as attached_count,
    w.action_type, w.permit_ref
  from winep_actions w
  left join sewage_assets a on a.id = w.asset_id
  left join sewage_systems sy on sy.id = w.sewage_system_id
  left join linkcount lc on lc.winep_action_id = w.id
  where w.organisation_id = (select id from org)
    and (w.water_body_id is not null or w.sewage_system_id is not null or w.asset_id is not null
         or lc.n is not null)
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
create or replace function public_spills_measures()
returns table (
  id uuid, action_ref text, action_component text, cycle text, driver_code text, driver_label text,
  driver_obligation text, action_name text, action_description text, completion_date date, complete boolean,
  wb_name text, attached_name text, attached_kind text, attached_count int,
  action_type text, permit_ref text
)
language sql stable security definer set search_path = public as $$
  select * from public_spills_measures((select public_org()));
$$;
grant execute on function public_spills_measures(uuid) to anon, authenticated;

-- public_emergency_overflows ------------------------------------------------------------------
create or replace function public_emergency_overflows(p_org uuid)
returns table (
  id uuid, overflow_name text, permit_ref text, stw_catchment text, receiving_water text,
  system_id uuid, system_name text, lat double precision, lng double precision, edm_commissioned text,
  total_spills int, total_hours numeric, latest_year int, latest_spills int, latest_hours numeric,
  worst_year int, worst_hours numeric, years jsonb
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  agg as (
    select s.emergency_overflow_id as eo_id,
      sum(s.spill_count) filter (where s.monitored) as total_spills,
      sum(s.duration_hours) filter (where s.monitored) as total_hours,
      jsonb_agg(jsonb_build_object('year', s.year, 'spills', s.spill_count, 'hours', s.duration_hours,
                                   'monitored', s.monitored, 'partial', s.partial_year) order by s.year) as years
    from eo_annual_spills s where s.organisation_id = (select id from org) group by s.emergency_overflow_id
  ),
  latest as (
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, spill_count, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year
    order by emergency_overflow_id, year desc
  ),
  worst as (
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored
    order by emergency_overflow_id, duration_hours desc, year desc
  )
  select eo.id, eo.overflow_name, eo.permit_ref, eo.stw_catchment, eo.receiving_water,
         eo.sewage_system_id, sy.name, eo.latitude, eo.longitude, eo.edm_commissioned,
         coalesce(agg.total_spills, 0)::int, coalesce(agg.total_hours, 0),
         latest.year, latest.spill_count, latest.duration_hours,
         worst.year, worst.duration_hours, coalesce(agg.years, '[]'::jsonb)
  from emergency_overflows eo
  left join sewage_systems sy on sy.id = eo.sewage_system_id
  left join agg on agg.eo_id = eo.id
  left join latest on latest.eo_id = eo.id
  left join worst on worst.eo_id = eo.id
  where eo.organisation_id = (select id from org)
  order by coalesce(agg.total_hours, 0) desc, eo.overflow_name;
$$;
create or replace function public_emergency_overflows()
returns table (
  id uuid, overflow_name text, permit_ref text, stw_catchment text, receiving_water text,
  system_id uuid, system_name text, lat double precision, lng double precision, edm_commissioned text,
  total_spills int, total_hours numeric, latest_year int, latest_spills int, latest_hours numeric,
  worst_year int, worst_hours numeric, years jsonb
)
language sql stable security definer set search_path = public as $$
  select * from public_emergency_overflows((select public_org()));
$$;
grant execute on function public_emergency_overflows(uuid) to anon, authenticated;

-- =============================================================================================
-- C. Id-scoped DETAIL RPCs — org derived from the id (same signature, multi-org correct)
-- =============================================================================================

-- public_eo_for_system: org derived from the system row.
create or replace function public_eo_for_system(p_system uuid)
returns table (
  id uuid, overflow_name text, permit_ref text,
  latest_year int, latest_hours numeric, total_hours numeric, worst_hours numeric
)
language sql stable security definer set search_path = public as $$
  with org as (select (select organisation_id from sewage_systems where id = p_system) as id),
  latest as (
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year
    order by emergency_overflow_id, year desc
  )
  select eo.id, eo.overflow_name, eo.permit_ref,
    latest.year, latest.duration_hours,
    (select coalesce(sum(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored),
    (select coalesce(max(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored)
  from emergency_overflows eo
  left join latest on latest.eo_id = eo.id
  where eo.organisation_id = (select id from org) and eo.sewage_system_id = p_system
  order by (select coalesce(sum(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored) desc;
$$;

-- public_spill_asset: id is the unique key; drop the redundant single-tenant org guard.
create or replace function public_spill_asset(p_asset uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry_all int, total_all int, pre_stw_all int, first_year int,
  last_spill_end timestamptz,
  bathing_water text, shellfish_water text
)
language sql stable security definer set search_path = public as $$
  with snap as (
    select status, status_start, latest_event_start, latest_event_end, captured_at lu
    from edm_snapshots where asset_id = p_asset order by captured_at desc limit 1
  ),
  y as (select coalesce(sum(dry), 0)::int dry, coalesce(sum(dry + wet + unknown), 0)::int total, min(year) fy from classify_spills_yearly(p_asset)),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank') and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  up as (select e.event_start::date as day from spill_events e where e.asset_id = p_asset and (e.duration_minutes is null or e.duration_minutes >= 15)),
  pre as (select count(*) filter (where wd.day is null)::int n from up left join wd on wd.day = up.day)
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu, y.dry, y.total, pre.n, y.fy,
         (select max(e.event_end) from spill_events e
            where e.asset_id = p_asset and e.event_end is not null
              and (e.duration_minutes is null or e.duration_minutes >= 15)) as last_spill_end,
         a.bathing_water, a.shellfish_water
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join snap s on true cross join y cross join pre
  where a.id = p_asset;
$$;

-- public_spill_brief: asset_id already pins the org; drop the redundant org guard.
create or replace function public_spill_brief(p_asset uuid, p_year int)
returns table (event_start timestamptz, event_end timestamptz, duration_minutes int)
language sql stable security definer set search_path = public as $$
  select event_start, event_end, duration_minutes
  from spill_events
  where asset_id = p_asset
    and duration_minutes is not null
    and duration_minutes > 0
    and duration_minutes < 15
    and (p_year is null or (event_start >= make_date(p_year, 1, 1) and event_start < make_date(p_year + 1, 1, 1)))
  order by event_start desc;
$$;

-- public_spill_heartbeat: asset_id pins the org; drop the redundant org guard.
create or replace function public_spill_heartbeat(p_asset uuid)
returns table (captured_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.captured_at from edm_snapshots s
  where s.asset_id = p_asset
    and s.captured_at >= now() - interval '48 hours'
  order by s.captured_at;
$$;

-- public_spills_measures_for_asset: derive the org from the asset so the winep scope is preserved.
create or replace function public_spills_measures_for_asset(p_asset uuid)
returns table (id uuid, action_ref text, action_name text, action_description text, driver_code text,
               driver_label text, driver_obligation text, cycle text, completion_date date, complete boolean,
               source text, action_type text, permit_ref text)
language sql stable security definer set search_path = public as $$
  with a as (select id from sewage_assets where id = p_asset)
  select w.id, w.action_id, w.action_name, w.action_description, w.driver_code, w.driver_label, w.driver_obligation,
    w.cycle, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    case when w.asset_id = (select id from a) then 'direct' else 'linked' end as source,
    w.action_type, w.permit_ref
  from winep_actions w
  where w.organisation_id = (select organisation_id from sewage_assets where id = p_asset)
    and (w.asset_id = (select id from a)
      or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = (select id from a)))
  order by w.completion_date nulls last, w.cycle desc;
$$;

-- public_spills_problem_for_asset: asset_id pins the org; drop the redundant org guard on the asset.
create or replace function public_spills_problem_for_asset(p_asset uuid)
returns table (
  asset_id uuid, total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with a as (select id, sewage_system_id, edm_enabled, asset_name from sewage_assets where id = p_asset),
  lfy as (select public_spills_latest_full_year() as y),
  works_days as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from a) and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  up as (select e.event_start::date as day from spill_events e
    where e.asset_id = p_asset and (select asset_name from a) !~ '(^| )STW[_ ]'
      and (e.duration_minutes is null or e.duration_minutes >= 15)),
  metrics as (
    select
      (select id from a) as asset_id, (select edm_enabled from a) as edm_enabled,
      (select count(*) filter (where duration_minutes is null or duration_minutes >= 15)::int from spill_events where asset_id = p_asset) as total_spills,
      (select round(sum(coalesce(duration_minutes, 0)) filter (
         where extract(year from event_start) = (select y from lfy) and (duration_minutes is null or duration_minutes >= 15)) / 60.0)::int
       from spill_events where asset_id = p_asset) as hours_lfy,
      (select coalesce(sum(dry), 0)::int from classify_spills_yearly(p_asset)) as dry,
      (select count(*) filter (where wd.day is null)::int from up left join works_days wd on wd.day = up.day) as pre_stw,
      (select case when lu is null then null else round(extract(epoch from (now() - lu)) / 3600.0, 1) end
       from (select coalesce(last_updated, captured_at) lu from edm_snapshots where asset_id = p_asset order by captured_at desc limit 1) s) as feed_hours,
      exists (
        select 1 from winep_actions w
        where (w.asset_id = p_asset or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = p_asset))
          and (w.completion_date is null or w.completion_date >= current_date)
      ) as has_action
  ),
  flags as (
    select m.*,
      case when coalesce(m.total_spills, 0) >= 800 then 5 when coalesce(m.total_spills, 0) >= 400 then 4 else 0 end as w_freq,
      case when coalesce(m.hours_lfy, 0) >= 900 then 5 when coalesce(m.hours_lfy, 0) >= 500 then 4 else 0 end as w_long,
      case when coalesce(m.dry, 0) >= 15 then 5 when coalesce(m.dry, 0) >= 5 then 3 else 0 end as w_dry,
      case when coalesce(m.pre_stw, 0) >= 12 then 5 when coalesce(m.pre_stw, 0) >= 4 then 3 else 0 end as w_prestw,
      case when m.edm_enabled and (m.feed_hours is null or m.feed_hours >= 12) then 2 else 0 end as w_feed
    from metrics m
  )
  select f.asset_id, coalesce(f.total_spills, 0), coalesce(f.hours_lfy, 0), coalesce(f.dry, 0), coalesce(f.pre_stw, 0), f.feed_hours,
    f.w_freq, f.w_long, f.w_dry, f.w_prestw, f.w_feed,
    (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) as weight, f.has_action
  from flags f where f.asset_id is not null;
$$;

-- public_spills_works_for_system: org derived from the system row.
create or replace function public_spills_works_for_system(p_system uuid)
returns table (
  system_id uuid, system_name text, works_asset_id uuid, works_name text,
  population int, permit_dwf numeric, demand_central numeric, load_pct int,
  verdict text, has_monitor boolean, works_hours int, upstream_count int, pre_stw_count int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with org as (select (select organisation_id from sewage_systems where id = p_system) as id),
  lfy as (select public_spills_latest_full_year((select id from org)) as y),
  works as (
    select distinct on (a.sewage_system_id) a.sewage_system_id as sys, a.id as works_id, a.asset_name as works_name
    from sewage_assets a where a.organisation_id = (select id from org) and a.asset_type = 'sewage_treatment_works'
      and a.sewage_system_id = p_system order by a.sewage_system_id, a.asset_name
  ),
  works_assets as (
    select a.id from sewage_assets a where a.organisation_id = (select id from org)
      and a.asset_type in ('sewage_treatment_works', 'storm_tank') and a.sewage_system_id = p_system
  ),
  works_hours as (
    select round(sum(coalesce(e.duration_minutes, 0)) / 60.0)::int hours
    from works_assets wa join spill_events e on e.asset_id = wa.id
    where (e.duration_minutes is null or e.duration_minutes >= 15) and extract(year from e.event_start) = (select y from lfy)
  ),
  works_days as (
    select e.event_start::date as day from works_assets wa join spill_events e on e.asset_id = wa.id
    where (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  monitor as (
    select exists (
      select 1 from works_assets wa where exists (select 1 from spill_events e where e.asset_id = wa.id)
        or exists (select 1 from edm_snapshots s where s.asset_id = wa.id)) as has_monitor
  ),
  up as (
    select a.id as asset_id, e.event_start::date as day from sewage_assets a join spill_events e on e.asset_id = a.id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and a.sewage_system_id = p_system and (e.duration_minutes is null or e.duration_minutes >= 15)
  ),
  upc as (select count(distinct a.id)::int n from sewage_assets a where a.organisation_id = (select id from org)
      and a.asset_type in ('combined_sewer_overflow', 'pumping_station') and a.sewage_system_id = p_system),
  pre as (select count(*) filter (where wd.day is null)::int pre_stw from up left join works_days wd on wd.day = up.day),
  cap as (select v.effective_population, v.demand_central_m3d from system_capacity_v v where v.system_id = p_system and v.organisation_id = (select id from org)),
  permit as (select distinct on (asset_id) permit_dwf_m3d from asset_permits where asset_id = (select works_id from works) order by asset_id, created_at desc),
  calc as (
    select w.sys, sy.name as system_name, w.works_id, w.works_name,
      (select effective_population from cap)::int as population,
      (select permit_dwf_m3d from permit) as permit_dwf,
      (select demand_central_m3d from cap) as demand_central,
      (select has_monitor from monitor) as has_monitor,
      coalesce((select hours from works_hours), 0) as works_hours,
      coalesce((select n from upc), 0) as upstream_count,
      coalesce((select pre_stw from pre), 0) as pre_stw_count
    from works w join sewage_systems sy on sy.id = w.sys
  ),
  derived as (
    select c.*,
      (c.population is not null and c.population > 0 and c.permit_dwf is not null and c.permit_dwf > 0 and c.demand_central is not null) as capacity_known,
      case when c.population is not null and c.population > 0 and c.permit_dwf is not null and c.permit_dwf > 0 and c.demand_central is not null
           then round(c.demand_central / c.permit_dwf * 100)::int end as load_pct
    from calc c
  )
  select sys, system_name, works_id, works_name, population, permit_dwf, demand_central, load_pct,
    case when not capacity_known then 'not_assessed' when load_pct > 100 then 'over' when load_pct >= 95 then 'limit' else 'within' end as verdict,
    has_monitor, works_hours, upstream_count, pre_stw_count,
    case
      when (capacity_known and load_pct >= 95 and works_hours > 0) and pre_stw_count >= 4 then 'both'
      when (capacity_known and load_pct >= 95 and works_hours > 0) then 'capacity'
      when pre_stw_count >= 4 then 'upstream'
      when not capacity_known then 'not_assessed' else 'none' end as diagnosis
  from derived;
$$;

-- public_spill_evidence: event id is the unique key; drop the redundant org guard.
create or replace function public_spill_evidence(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.id, e.asset_id, e.event_start, e.event_end, e.ongoing, e.duration_minutes,
           e.event_start::date as spill_day, extract(year from e.event_start)::int as yr
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where e.id = p_event
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

-- public_winep_for_asset: derive the org from the asset so the water-body scope is preserved.
create or replace function public_winep_for_asset(p_asset_id uuid)
returns table (
  id uuid, cycle text, driver_code text, driver_label text, driver_obligation text,
  action_name text, action_description text, completion_date date, overdue boolean, link_kind text,
  proposed_permit_dwf text, proposed_bod text, proposed_nh3 text, proposed_p text,
  bathing_water text, shellfish_water text, wb_name text
)
language sql stable security definer set search_path = public as $$
  with a as (
    select id, sewage_system_id, water_body_id from sewage_assets
    where id = p_asset_id
  )
  select w.id, w.cycle, w.driver_code, w.driver_label, w.driver_obligation,
         w.action_name, w.action_description, w.completion_date,
         (w.completion_date is not null and w.completion_date < current_date) as overdue,
         case when w.asset_id = a.id then 'asset'
              when a.sewage_system_id is not null and w.sewage_system_id = a.sewage_system_id then 'works'
              else 'waterbody' end as link_kind,
         w.proposed_permit_dwf, w.proposed_bod, w.proposed_nh3, w.proposed_p,
         w.bathing_water, w.shellfish_water, w.wb_name
  from winep_actions w cross join a
  where w.organisation_id = (select organisation_id from sewage_assets where id = p_asset_id)
    and (w.asset_id = a.id
      or (a.sewage_system_id is not null and w.sewage_system_id = a.sewage_system_id)
      or (a.water_body_id is not null and w.water_body_id = a.water_body_id))
  order by (case when w.asset_id = a.id then 0
                 when w.sewage_system_id = a.sewage_system_id then 1 else 2 end),
           w.completion_date nulls last, w.cycle desc;
$$;

-- =============================================================================================
-- D. Re-issue public_spills_problems(p_org) to use the p_org-aware helpers (closes 0081 caveat)
-- =============================================================================================
create or replace function public_spills_problems(p_org uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text, system_id uuid, system_name text,
  total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  lfy as (select public_spills_latest_full_year(p_org) as y),
  base as (
    select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text as atype, a.sewage_system_id, a.edm_enabled
    from sewage_assets a where a.organisation_id = (select id from org)
  ),
  spills as (
    select e.asset_id,
      count(*) filter (where e.duration_minutes is null or e.duration_minutes >= 15)::int as total,
      round(sum(coalesce(e.duration_minutes, 0)) filter (
        where extract(year from e.event_start) = (select y from lfy) and (e.duration_minutes is null or e.duration_minutes >= 15)
      ) / 60.0)::int as hours_lfy
    from spill_events e where e.organisation_id = (select id from org) group by e.asset_id
  ),
  ds as (select asset_id, dry from dry_spill_summary(1, 0.25, null, 15, p_org)),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and a.asset_name !~ '(^| )STW[_ ]'
      and (e.duration_minutes is null or e.duration_minutes >= 15)
  ),
  pre as (
    select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw
    from up left join works_days wd on wd.sys = up.sys and wd.day = up.day group by up.asset_id
  ),
  snap as (
    select distinct on (asset_id) asset_id, coalesce(last_updated, captured_at) as lu
    from edm_snapshots where organisation_id = (select id from org) order by asset_id, captured_at desc
  ),
  metrics as (
    select b.id, b.asset_name, b.asset_unique_id, b.atype, b.sewage_system_id, b.edm_enabled,
      coalesce(s.total, 0) as total, coalesce(s.hours_lfy, 0) as hours_lfy,
      coalesce(ds.dry, 0) as dry, coalesce(pre.pre_stw, 0) as pre_stw,
      case when snap.lu is null then null else round(extract(epoch from (now() - snap.lu)) / 3600.0, 1) end as feed_hours,
      exists (
        select 1 from winep_actions w
        where (w.asset_id = b.id or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = b.id))
          and (w.completion_date is null or w.completion_date >= current_date)
      ) as has_action
    from base b
    left join spills s on s.asset_id = b.id
    left join ds on ds.asset_id = b.id
    left join pre on pre.asset_id = b.id
    left join snap on snap.asset_id = b.id
  ),
  flags as (
    select m.*,
      case when m.total >= 800 then 5 when m.total >= 400 then 4 else 0 end as w_freq,
      case when m.hours_lfy >= 900 then 5 when m.hours_lfy >= 500 then 4 else 0 end as w_long,
      case when m.dry >= 15 then 5 when m.dry >= 5 then 3 else 0 end as w_dry,
      case when m.pre_stw >= 12 then 5 when m.pre_stw >= 4 then 3 else 0 end as w_prestw,
      case when m.edm_enabled and (m.feed_hours is null or m.feed_hours >= 12) then 2 else 0 end as w_feed
    from metrics m
  )
  select f.id, f.asset_name, f.asset_unique_id, f.atype, f.sewage_system_id, sy.name,
    f.total, f.hours_lfy, f.dry, f.pre_stw, f.feed_hours,
    f.w_freq, f.w_long, f.w_dry, f.w_prestw, f.w_feed,
    (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) as weight, f.has_action
  from flags f left join sewage_systems sy on sy.id = f.sewage_system_id
  order by (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) desc, f.total desc;
$$;

notify pgrst, 'reload schema';
