-- 0137: Welsh rivers' record figures fall back to the annual returns (WALES-ROLLOUT-PLAN.md §5, W3 pilot).
--
-- The record functions count from spill_events, which for English rivers go back years (the EA's
-- start/stop files). Wales publishes no start/stop files, so a Welsh river's spill_events start with
-- River Hub's own hourly readings of the company's feed (28 Nov 2026). Taking the Teifi live showed the
-- result: no "latest full year", so 0 hours last year where its 2025 annual returns give 47,628, and an
-- empty reduction tracker. For Welsh rivers only (organisations.nation = 'wales'):
--
-- * public_spills_latest_full_year: the latest year in edm_annual_stats when no spill_events year is
--   complete.
-- * public_spills_reduction: annual-return years join the event years, so each overflow's series, baseline
--   and latest year come from the returns (ea_counted_spills already prefers the annual figure).
-- * public_spills_problems: hours in the latest full year and the all-years spill total come from the
--   annual returns for the years before the event record starts.
--
-- English rivers are unchanged: every added branch is conditioned on nation = 'wales'.

create or replace function public.public_spills_latest_full_year(p_org uuid)
returns integer language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select max(yr) from (
       select distinct extract(year from event_start)::int yr from spill_events
       where organisation_id = p_org and extract(year from event_start) < extract(year from now())
     ) y),
    (select max(s.year)::int from edm_annual_stats s
       join organisations o on o.id = s.organisation_id and o.nation = 'wales'
      where s.organisation_id = p_org and s.year < extract(year from now()))
  );
$$;

create or replace function public.public_spills_reduction(p_org uuid)
returns table (asset_id uuid, asset_name text, asset_code text, system_name text, baseline_year integer, baseline integer,
               latest_year integer, latest integer, latest_events integer, pct_change integer, x_cap numeric, deadline text,
               verdict text, series jsonb)
language sql stable security definer set search_path = public, extensions as $$
  with org as (select p_org as id),
  wales as (select exists (select 1 from organisations where id = p_org and nation = 'wales') as w),
  lfy as (select public_spills_latest_full_year(p_org) as y),
  ay as (
    select distinct asset_id, extract(year from event_start)::int as yr
    from spill_events where organisation_id = (select id from org)
    union
    -- Wales: the annual returns are the record before River Hub's own readings began
    select s.asset_id, s.year::int
    from edm_annual_stats s, wales
    where wales.w and s.organisation_id = (select id from org) and s.asset_id is not null
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

create or replace function public.public_spills_problems(p_org uuid)
returns table (asset_id uuid, asset_name text, asset_code text, asset_type text, system_id uuid, system_name text,
               total_spills integer, hours_lfy integer, dry integer, pre_stw integer, feed_hours numeric, w_freq integer,
               w_long integer, w_dry integer, w_prestw integer, w_feed integer, weight integer, has_action boolean)
language sql stable security definer set search_path = public, extensions as $$
  with org as (select p_org as id),
  wales as (select exists (select 1 from organisations where id = p_org and nation = 'wales') as w),
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
  -- Wales: the annual returns stand in for the years before the event record starts
  annual as (
    select s.asset_id,
      round(sum(s.spill_count))::int as spills_before,
      round(sum(s.total_duration_hours) filter (where s.year = (select y from lfy)))::int as hours_lfy
    from edm_annual_stats s, wales
    where wales.w and s.organisation_id = (select id from org) and s.asset_id is not null
      and s.year < extract(year from now())
    group by s.asset_id
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
      coalesce(s.total, 0) + coalesce(an.spills_before, 0) as total,
      coalesce(s.hours_lfy, an.hours_lfy, 0) as hours_lfy,
      coalesce(ds.dry, 0) as dry, coalesce(pre.pre_stw, 0) as pre_stw,
      case when snap.lu is null then null else round(extract(epoch from (now() - snap.lu)) / 3600.0, 1) end as feed_hours,
      exists (
        select 1 from winep_actions w
        where (w.asset_id = b.id or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = b.id))
          and (w.completion_date is null or w.completion_date >= current_date)
      ) as has_action
    from base b
    left join spills s on s.asset_id = b.id
    left join annual an on an.asset_id = b.id
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
