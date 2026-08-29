-- Repeat dry-weather offenders (PUBLIC-SITE-REDESIGN.md). Assets that dry-spilled in two or more
-- years — persistence signals a standing fault / groundwater ingress rather than a one-off. Mirrors
-- the members dry-spills page. Cross-year (not period-scoped), 15-min minimum. Anon-readable.

create or replace function public_spills_repeat_offenders()
returns table (asset_id uuid, asset_name text, asset_code text, years int, total_dry int)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  rng as (
    select min(extract(year from event_start))::int lo, max(extract(year from event_start))::int hi
    from spill_events where organisation_id = (select id from org)
  ),
  yrs as (select generate_series(lo, hi) as y from rng),
  per as (
    select s.asset_id, yrs.y, s.dry
    from yrs cross join lateral dry_spill_summary(1, 0.25, yrs.y, 15) s
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

grant execute on function public_spills_repeat_offenders() to anon, authenticated;
