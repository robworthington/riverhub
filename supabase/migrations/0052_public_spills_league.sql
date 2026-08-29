-- Public spills league (PUBLIC-SITE-REDESIGN.md, Phase 3). Per-asset period totals — hours spilled,
-- dry-spill count (our 0.25 mm method), and pre-STW count — for the three league panels. Anon-readable.

create or replace function public_spills_league(p_year int)
returns table (asset_id uuid, asset_name text, asset_code text, hours int, dry int, pre_stw int)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  hrs as (
    select e.asset_id, round(sum(coalesce(e.duration_minutes, 0)) / 60.0)::int hours
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
    group by e.asset_id
  ),
  ds as (select asset_id, dry from dry_spill_summary(1, 0.25, p_year)),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
  ),
  pre as (
    select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw
    from up left join works_days wd on wd.sys = up.sys and wd.day = up.day
    group by up.asset_id
  )
  select a.id, a.asset_name, a.asset_unique_id,
         coalesce(hrs.hours, 0), coalesce(ds.dry, 0), coalesce(pre.pre_stw, 0)
  from sewage_assets a
  left join hrs on hrs.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  where a.organisation_id = (select id from org)
    and (hrs.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;

grant execute on function public_spills_league(int) to anon, authenticated;
