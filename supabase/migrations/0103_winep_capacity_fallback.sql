-- River Hub — WINEP as a fallback source for a treatment works' permitted dry-weather flow.
--
-- The capacity check compares estimated demand (population × water use + infiltration) with each
-- works' permitted dry-weather flow (DWF), which until now came only from loaded permit documents
-- (asset_permits; the Dart only). WINEP actions that change a works' permit record its current DWF
-- (and often the proposed one). Where no permit is loaded, that WINEP figure is used instead and
-- labelled as such. A loaded permit always wins.
--
-- Plausibility guard: a WINEP figure is used only when it gives a load between 25% and 200%. River
-- Hub's sewage "systems" and their census-based population estimates don't always line up with the
-- single works a WINEP action describes (a grouped system, or a catchment estimate far larger than a
-- 12 m³/day village works). Outside that range the works stays "not assessed" and
-- public_capacity_sources() reports the mismatch, rather than publishing a figure like 1,726%.
--
-- 1. works_winep_flows: one row per sewage system, matched from winep_actions by works name
--    (SWW "<WORKS>_STW_<TOWN>" / Wessex "<Works> WRC - …"), plus reviewed manual matches.
-- 2. public_spills_works(p_org), public_spills_works_for_system(p_system), public_area_stw(...)
--    take the fallback (bodies otherwise unchanged; same signatures).
-- 3. public_capacity_sources(p_org): which works use (or were refused) a WINEP figure, for labels.

create table if not exists works_winep_flows (
  sewage_system_id  uuid primary key references sewage_systems(id) on delete cascade,
  organisation_id   uuid not null references organisations(id) on delete cascade,
  asset_id          uuid references sewage_assets(id) on delete set null,   -- the matched works asset
  winep_action_id   uuid not null references winep_actions(id) on delete cascade,
  action_name       text,
  dwf_m3d           numeric not null check (dwf_m3d > 0),
  proposed_dwf_m3d  numeric,                -- numeric proposed DWF, when WINEP gives one
  proposed_note     text,                   -- e.g. "requires detailed evaluation"
  completion_date   date,
  cycle             text,
  match_method      text not null check (match_method in ('name', 'manual')),
  created_at        timestamptz not null default now()
);
alter table works_winep_flows enable row level security;
revoke all on works_winep_flows from anon, authenticated;

-- Normalised works key: letters only, upper case, up to "STW"/"WRC"/"INLET" or the first "_" segment.
create or replace function works_name_key(t text) returns text
language sql immutable as $$
  select upper(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(t, ''), '_.*$', ''),                                -- "HEMYOCK STW_SO_HEMYOCK" → "HEMYOCK STW"
      '\s*(STW|S\s*T\s*W|SEWAGE TREATMENT WORKS|WWTW|WRC|INLET)\y.*$', '', 'i'),  -- drop the works suffix and anything after
    '[^A-Za-z]', '', 'g'))
$$;

-- (Re)build the matches. Name matches within the same river; one WINEP action per system (latest
-- completion date first). Manual matches are kept across rebuilds.
create or replace function match_winep_flows() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from works_winep_flows where match_method = 'name';
  insert into works_winep_flows (sewage_system_id, organisation_id, asset_id, winep_action_id, action_name,
                                 dwf_m3d, proposed_dwf_m3d, proposed_note, completion_date, cycle, match_method)
  select distinct on (a.sewage_system_id)
    a.sewage_system_id, a.organisation_id, a.id, w.id, w.action_name,
    w.current_permit_dwf::numeric,
    case when w.proposed_permit_dwf ~ '^[0-9.]+$' then w.proposed_permit_dwf::numeric end,
    case when w.proposed_permit_dwf !~ '^[0-9.]+$' then nullif(trim(w.proposed_permit_dwf), '') end,
    w.completion_date, w.cycle, 'name'
  from winep_actions w
  join sewage_assets a
    on a.organisation_id = w.organisation_id
   and a.asset_type = 'sewage_treatment_works'
   and a.sewage_system_id is not null
   and works_name_key(a.asset_name) = works_name_key(split_part(w.action_name, ' - ', 1))
   and works_name_key(a.asset_name) <> ''
  where w.current_permit_dwf ~ '^[0-9]+(\.[0-9]+)?$' and w.current_permit_dwf::numeric > 0
    and not exists (select 1 from works_winep_flows m where m.sewage_system_id = a.sewage_system_id and m.match_method = 'manual')
  order by a.sewage_system_id, w.completion_date desc nulls last, w.id;
  get diagnostics n = row_count;
  return n;
end $$;

select match_winep_flows();

-- Reviewed manual match (23 Nov 2026): Wessex "Bradford-on-Tone WRC" ↔ River Hub "BRADFORD ON TONE INLET"
-- (hyphenation defeats the name key).
insert into works_winep_flows (sewage_system_id, organisation_id, asset_id, winep_action_id, action_name,
                               dwf_m3d, proposed_dwf_m3d, proposed_note, completion_date, cycle, match_method)
select a.sewage_system_id, a.organisation_id, a.id, w.id, w.action_name, w.current_permit_dwf::numeric,
       null, null, w.completion_date, w.cycle, 'manual'
from winep_actions w
join organisations o on o.id = w.organisation_id and o.river_slug = 'tone'
join sewage_assets a on a.organisation_id = w.organisation_id and a.asset_name = 'BRADFORD ON TONE INLET'
where w.action_name = 'Bradford-on-Tone WRC - Phosphorus Removal' and w.current_permit_dwf ~ '^[0-9.]+$'
  and a.sewage_system_id is not null
on conflict (sewage_system_id) do update set
  asset_id = excluded.asset_id, winep_action_id = excluded.winep_action_id, action_name = excluded.action_name,
  dwf_m3d = excluded.dwf_m3d, completion_date = excluded.completion_date, cycle = excluded.cycle, match_method = 'manual';

-- A WINEP DWF is only trusted when it gives a plausible load (25%–200%) against River Hub's demand estimate.
create or replace function winep_dwf_plausible(p_dwf numeric, p_demand numeric) returns boolean
language sql immutable as $$
  select p_dwf is not null and p_dwf > 0 and p_demand is not null and p_demand > 0
     and p_demand / p_dwf between 0.25 and 2.0
$$;

revoke all on function match_winep_flows() from public, anon, authenticated;
grant execute on function match_winep_flows() to service_role;

-- ---------- the capacity functions take the fallback ----------

create or replace function public_spills_works(p_org uuid)
returns table (system_id uuid, system_name text, works_asset_id uuid, works_name text, population integer, permit_dwf numeric, demand_central numeric, load_pct integer, verdict text, has_monitor boolean, works_hours integer, upstream_count integer, pre_stw_count integer, diagnosis text)
language sql stable security definer set search_path = public as $function$
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
  -- A loaded permit wins; otherwise the works' current DWF from WINEP when it's plausible (0103).
  permit as (
    select w.sys,
           coalesce(lp.permit_dwf_m3d,
                    case when winep_dwf_plausible(wf.dwf_m3d, cap.demand_central_m3d) then wf.dwf_m3d end) as permit_dwf_m3d
    from works w
    left join latest_permit lp on lp.asset_id = w.works_id
    left join works_winep_flows wf on wf.sewage_system_id = w.sys
    left join cap on cap.system_id = w.sys
    where coalesce(lp.permit_dwf_m3d, wf.dwf_m3d) is not null
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
$function$;

create or replace function public_spills_works_for_system(p_system uuid)
returns table (system_id uuid, system_name text, works_asset_id uuid, works_name text, population integer, permit_dwf numeric, demand_central numeric, load_pct integer, verdict text, has_monitor boolean, works_hours integer, upstream_count integer, pre_stw_count integer, diagnosis text)
language sql stable security definer set search_path = public as $function$
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
  -- A loaded permit wins; otherwise the works' current DWF from WINEP when it's plausible (0103).
  permit as (
    select coalesce(
      (select permit_dwf_m3d from asset_permits where asset_id = (select works_id from works) order by created_at desc limit 1),
      (select wf.dwf_m3d from works_winep_flows wf
        where wf.sewage_system_id = p_system and winep_dwf_plausible(wf.dwf_m3d, (select demand_central_m3d from cap)))
    ) as permit_dwf_m3d
  ),
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
$function$;

create or replace function public_area_stw(p_org uuid, p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text, demand_central numeric, pct_remaining integer)
language sql stable security definer set search_path = public as $function$
  with stw as (
    select a.id, a.asset_name, a.sewage_system_id, a.actual_capacity_m3d
    from sewage_assets a
    where a.organisation_id = p_org
      and a.parish_id = any(p_ids) and a.asset_type = 'sewage_treatment_works'
  ),
  permit as (
    select distinct on (asset_id) asset_id, permit_dwf_m3d
    from asset_permits order by asset_id, created_at desc
  ),
  basis as (
    select stw.*, p.permit_dwf_m3d, w.winep_dwf,
           coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d, w.winep_dwf) as cap
    from stw
    left join permit p on p.asset_id = stw.id
    left join lateral (
      select wf.dwf_m3d as winep_dwf from works_winep_flows wf
      join system_capacity_v v on v.system_id = wf.sewage_system_id
      where wf.sewage_system_id = stw.sewage_system_id and winep_dwf_plausible(wf.dwf_m3d, v.demand_central_m3d)
    ) w on true
  )
  select b.id, b.asset_name, sy.name,
    b.cap,
    case when b.actual_capacity_m3d is not null then 'installed capacity (EIR)'
         when b.permit_dwf_m3d is not null then 'permit DWF'
         when b.winep_dwf is not null then 'permit DWF (from WINEP)' end,
    cv.demand_central_m3d,
    case when b.cap > 0 and cv.demand_central_m3d is not null
         then round((1 - cv.demand_central_m3d / b.cap) * 100)::int
    end
  from basis b
  left join sewage_systems sy on sy.id = b.sewage_system_id
  left join system_capacity_v cv on cv.system_id = b.sewage_system_id
  order by b.asset_name;
$function$;

-- ---------- labels ----------

-- For each works in a river with a matched WINEP figure and no loaded permit: the WINEP details, and
-- whether it was used ('winep') or refused because it doesn't fit the demand estimate ('mismatch').
create or replace function public_capacity_sources(p_org uuid)
returns table (system_id uuid, source text, dwf_m3d numeric, proposed_dwf_m3d numeric, proposed_note text,
               completion_date date, cycle text, action_name text, demand_central numeric, population integer)
language sql stable security definer set search_path = public as $$
  select wf.sewage_system_id,
         case when winep_dwf_plausible(wf.dwf_m3d, v.demand_central_m3d) then 'winep' else 'mismatch' end,
         wf.dwf_m3d, wf.proposed_dwf_m3d, wf.proposed_note, wf.completion_date, wf.cycle, wf.action_name,
         v.demand_central_m3d, v.effective_population::integer
  from works_winep_flows wf
  join organisations o on o.id = wf.organisation_id and o.live
  left join system_capacity_v v on v.system_id = wf.sewage_system_id
  where wf.organisation_id = p_org
    and not exists (
      select 1 from sewage_assets a
      join lateral (select permit_dwf_m3d from asset_permits ap where ap.asset_id = a.id order by ap.created_at desc limit 1) lp on true
      where a.sewage_system_id = wf.sewage_system_id and a.asset_type = 'sewage_treatment_works' and lp.permit_dwf_m3d is not null)
$$;

grant execute on function public_capacity_sources(uuid) to anon, authenticated;
