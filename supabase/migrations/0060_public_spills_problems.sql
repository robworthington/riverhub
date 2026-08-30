-- Spills framing layers, Phase 2: Problems & action data (SPILLS-FRAMING-LAYERS.md).
-- public_spills_problems() — per-asset problem flags (with magnitude-scaled weights) and whether a
-- measure is deliberately linked to the asset; a flagged asset with no linked measure is a gap.
-- public_spills_measures_for_asset() — the measures that count as action on an asset (direct WINEP
-- asset_id + manual winep_asset_links). Loose works/waterbody WINEP matches deliberately do NOT count
-- toward coverage, so the "gap" headline stays meaningful and under FoD's control.

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
    from spill_events e where e.organisation_id = (select id from org)
    group by e.asset_id
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
      (exists (select 1 from winep_asset_links l where l.asset_id = b.id)
        or exists (select 1 from winep_actions w where w.asset_id = b.id)) as has_action
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
    (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) as weight,
    f.has_action
  from flags f
  left join sewage_systems sy on sy.id = f.sewage_system_id
  order by (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) desc, f.total desc;
$$;
grant execute on function public_spills_problems() to anon, authenticated;

-- Measures that count as action on an asset: direct WINEP asset_id + manual winep_asset_links.
create or replace function public_spills_measures_for_asset(p_asset uuid)
returns table (id uuid, action_ref text, action_name text, driver_label text, driver_obligation text,
               cycle text, completion_date date, overdue boolean, source text)
language sql stable security definer set search_path = public as $$
  with a as (select id from sewage_assets where id = p_asset and organisation_id = (select public_org()))
  select w.id, w.action_id, w.action_name, w.driver_label, w.driver_obligation, w.cycle, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as overdue,
    case when w.asset_id = (select id from a) then 'direct' else 'linked' end as source
  from winep_actions w
  where w.organisation_id = (select public_org())
    and (w.asset_id = (select id from a)
      or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = (select id from a)))
  order by w.completion_date nulls last, w.cycle desc;
$$;
grant execute on function public_spills_measures_for_asset(uuid) to anon, authenticated;
