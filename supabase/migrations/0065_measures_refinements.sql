-- Measures refinements (tidy-up round). Five changes:
-- 1. A past completion date means the measure is assumed COMPLETE, not overdue.
-- 2. Expose what a measure requires (action_description) and its driver code for type derivation.
-- 3. "Action under way" counts only measures that are NOT yet complete — a measure completed while an
--    asset is still failing is not addressing the current problem, so the asset stays a gap.
-- 4. Exclude treatment works (name contains "STW") from the "before the works" / pre-STW set — a works
--    is the end of the line and cannot spill before itself.
-- (The investigation-vs-improvement distinction is derived in the UI from the driver code.)

-- helper predicate reused below: an asset has an ACTIVE (not-yet-complete) measure linked to it
-- (direct WINEP asset_id or a manual winep_asset_links row).
-- Inlined per RPC because SQL functions can't share a lateral predicate cleanly.

-- 1 & 2. Register: add action_description, swap overdue -> complete.
drop function if exists public_spills_measures();
create function public_spills_measures()
returns table (
  id uuid, action_ref text, action_component text, cycle text, driver_code text, driver_label text,
  driver_obligation text, action_name text, action_description text, completion_date date, complete boolean,
  wb_name text, attached_name text, attached_kind text, attached_count int
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  linkcount as (select winep_action_id, count(*)::int n from winep_asset_links group by winep_action_id)
  select w.id, w.action_id, w.action_component, w.cycle, w.driver_code, w.driver_label,
    w.driver_obligation, w.action_name, w.action_description, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    w.wb_name,
    coalesce(a.asset_name, sy.name) as attached_name,
    case when w.asset_id is not null then 'asset'
         when w.sewage_system_id is not null then 'works'
         when w.wb_name is not null then 'waterbody' else 'none' end as attached_kind,
    (coalesce(lc.n, 0) + case when w.asset_id is not null then 1 else 0 end) as attached_count
  from winep_actions w
  left join sewage_assets a on a.id = w.asset_id
  left join sewage_systems sy on sy.id = w.sewage_system_id
  left join linkcount lc on lc.winep_action_id = w.id
  where w.organisation_id = (select id from org)
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
grant execute on function public_spills_measures() to anon, authenticated;

-- Per-asset measures: add action_description, driver_code (for type), and complete.
drop function if exists public_spills_measures_for_asset(uuid);
create function public_spills_measures_for_asset(p_asset uuid)
returns table (id uuid, action_ref text, action_name text, action_description text, driver_code text,
               driver_label text, driver_obligation text, cycle text, completion_date date, complete boolean, source text)
language sql stable security definer set search_path = public as $$
  with a as (select id from sewage_assets where id = p_asset and organisation_id = (select public_org()))
  select w.id, w.action_id, w.action_name, w.action_description, w.driver_code, w.driver_label, w.driver_obligation,
    w.cycle, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    case when w.asset_id = (select id from a) then 'direct' else 'linked' end as source
  from winep_actions w
  where w.organisation_id = (select public_org())
    and (w.asset_id = (select id from a)
      or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = (select id from a)))
  order by w.completion_date nulls last, w.cycle desc;
$$;
grant execute on function public_spills_measures_for_asset(uuid) to anon, authenticated;

-- 3 & 4. public_spills_problems: has_action counts only ACTIVE measures; exclude STW-named assets from
-- the pre-STW upstream set.
create or replace function public_spills_problems()
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text, system_id uuid, system_name text,
  total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select public_spills_latest_full_year() as y),
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
  ds as (select asset_id, dry from dry_spill_summary(1, 0.25, null, 15)),
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
grant execute on function public_spills_problems() to anon, authenticated;

-- Per-asset scoped variant: same two changes.
create or replace function public_spills_problem_for_asset(p_asset uuid)
returns table (
  asset_id uuid, total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with a as (select id, sewage_system_id, edm_enabled, asset_name from sewage_assets where id = p_asset and organisation_id = (select public_org())),
  lfy as (select public_spills_latest_full_year() as y),
  works_days as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from a) and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  -- a works asset (name contains STW) can never be "before the works"
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
grant execute on function public_spills_problem_for_asset(uuid) to anon, authenticated;
