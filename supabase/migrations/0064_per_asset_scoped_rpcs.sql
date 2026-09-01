-- Phase 6 hardening (REGULATORY-RESTRUCTURE-PLAN.md): the asset page was calling the two heavy
-- full-catchment aggregates (public_spills_problems + public_spills_works) just to pick out one row,
-- so a transient timeout on either cached an incomplete asset page for up to an hour. These scoped
-- variants compute the same fields for a single asset / single system, so an asset page no longer
-- depends on a catchment-wide scan.

-- One asset's problem flags (same shape/weights as public_spills_problems, minus the names the page
-- already holds from the header).
create or replace function public_spills_problem_for_asset(p_asset uuid)
returns table (
  asset_id uuid, total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with a as (select id, sewage_system_id, edm_enabled from sewage_assets where id = p_asset and organisation_id = (select public_org())),
  lfy as (select public_spills_latest_full_year() as y),
  works_days as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from a) and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  up as (select e.event_start::date as day from spill_events e where e.asset_id = p_asset and (e.duration_minutes is null or e.duration_minutes >= 15)),
  metrics as (
    select
      (select id from a) as asset_id,
      (select edm_enabled from a) as edm_enabled,
      (select count(*) filter (where duration_minutes is null or duration_minutes >= 15)::int from spill_events where asset_id = p_asset) as total_spills,
      (select round(sum(coalesce(duration_minutes, 0)) filter (
         where extract(year from event_start) = (select y from lfy) and (duration_minutes is null or duration_minutes >= 15)) / 60.0)::int
       from spill_events where asset_id = p_asset) as hours_lfy,
      (select coalesce(sum(dry), 0)::int from classify_spills_yearly(p_asset)) as dry,
      (select count(*) filter (where wd.day is null)::int from up left join works_days wd on wd.day = up.day) as pre_stw,
      (select case when lu is null then null else round(extract(epoch from (now() - lu)) / 3600.0, 1) end
       from (select coalesce(last_updated, captured_at) lu from edm_snapshots where asset_id = p_asset order by captured_at desc limit 1) s) as feed_hours,
      (exists (select 1 from winep_asset_links l where l.asset_id = p_asset)
        or exists (select 1 from winep_actions w where w.asset_id = p_asset)) as has_action
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
grant execute on function public_spills_problem_for_asset(uuid) to anon, authenticated;

-- One system's works & capacity row (same shape as public_spills_works, scoped to p_system).
create or replace function public_spills_works_for_system(p_system uuid)
returns table (
  system_id uuid, system_name text, works_asset_id uuid, works_name text,
  population int, permit_dwf numeric, demand_central numeric, load_pct int,
  verdict text, has_monitor boolean, works_hours int, upstream_count int, pre_stw_count int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select public_spills_latest_full_year() as y),
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
grant execute on function public_spills_works_for_system(uuid) to anon, authenticated;
