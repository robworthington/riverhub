-- Spills framing layers, Phase 0 foundation (SPILLS-FRAMING-LAYERS.md).
-- 1) winep_asset_links: members-managed manual links from a WINEP measure to an asset. This is the
--    "Actions" source alongside winep_actions.asset_id. A flagged asset with no linked measure is a
--    gap. 2) public_spills_works(): the Works & capacity screen data — load against permit, verdict,
--    diagnosis, overflow-at-works, upstream/pre-STW.

-- ---------------------------------------------------------------------------
-- 1. Manual measure -> asset links (members write, anon read via RPC)
-- ---------------------------------------------------------------------------
create table if not exists winep_asset_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  winep_action_id uuid not null references winep_actions(id) on delete cascade,
  asset_id uuid not null references sewage_assets(id) on delete cascade,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (winep_action_id, asset_id)
);

create index if not exists winep_asset_links_asset_idx on winep_asset_links(asset_id);
create index if not exists winep_asset_links_action_idx on winep_asset_links(winep_action_id);

alter table winep_asset_links enable row level security;

-- Members of the owning org may read and manage links; writes are scoped to their org.
drop policy if exists winep_asset_links_read on winep_asset_links;
create policy winep_asset_links_read on winep_asset_links for select
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()));

drop policy if exists winep_asset_links_write on winep_asset_links;
create policy winep_asset_links_write on winep_asset_links for all
  using (organisation_id = (select organisation_id from profiles where id = auth.uid()))
  with check (organisation_id = (select organisation_id from profiles where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Works & capacity screen data
-- ---------------------------------------------------------------------------
-- Latest complete calendar year present in the data (excludes the current partial year), used for
-- the overflow-at-works hours and the "works overflow running" diagnosis signal.
create or replace function public_spills_latest_full_year()
returns int language sql stable security definer set search_path = public as $$
  select max(yr) from (
    select distinct extract(year from event_start)::int yr from spill_events
    where organisation_id = (select public_org()) and extract(year from event_start) < extract(year from now())
  ) y;
$$;
grant execute on function public_spills_latest_full_year() to anon, authenticated;

create or replace function public_spills_works()
returns table (
  system_id uuid, system_name text, works_asset_id uuid, works_name text,
  population int, permit_dwf numeric, demand_central numeric, load_pct int,
  verdict text, has_monitor boolean, works_hours int, upstream_count int, pre_stw_count int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select public_spills_latest_full_year() as y),
  -- the treatment-works asset that carries the permit for each system
  works as (
    select distinct on (a.sewage_system_id) a.sewage_system_id as sys, a.id as works_id, a.asset_name as works_name
    from sewage_assets a
    where a.organisation_id = (select id from org) and a.asset_type = 'sewage_treatment_works'
    order by a.sewage_system_id, a.asset_name
  ),
  -- all works-type assets per system (STW + storm tanks) for overflow-at-works + monitor presence
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
    -- capacity can only be assessed with BOTH a population estimate and a permit DWF; a zero/absent
    -- population is unknown, not a real zero load
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
      when pre_stw_count >= 4 then 'upstream'      -- upstream faults don't need a permit to diagnose
      when not capacity_known then 'not_assessed'
      else 'none'
    end as diagnosis
  from derived
  order by (not capacity_known), load_pct desc nulls last;
$$;
grant execute on function public_spills_works() to anon, authenticated;
