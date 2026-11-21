-- Phase 1 workstream D — national aggregate RPCs for the summary page + river chooser.
--
-- Built directly over the existing per-river RPCs via lateral joins across live organisations. This
-- is correct and fast at Phase-1 scale (a handful of rivers); the national summary should move to
-- materialised views (workstream A3) before the dataset grows to the full England scale, so these
-- stay under the 3s anon statement timeout. Anon-granted; security definer.

-- Per-river rollup: one row per live river, worst-first (for the chooser cards and the league block).
create or replace function national_rivers()
returns table (
  slug text, river_name text, region text, org_name text,
  overflows int, gaps int, dry int, hours_lfy int
)
language sql stable security definer set search_path = public as $$
  select o.river_slug, o.river_name, o.region, o.name,
         count(p.*)::int,
         count(*) filter (where p.weight > 0 and not p.has_action)::int,
         coalesce(sum(p.dry), 0)::int,
         coalesce(sum(p.hours_lfy), 0)::int
  from organisations o
  left join lateral public_spills_problems(o.id) p on true
  where o.live and o.river_slug is not null
  group by o.id, o.river_slug, o.river_name, o.region, o.name
  order by count(*) filter (where p.weight > 0 and not p.has_action) desc, o.river_name;
$$;
grant execute on function national_rivers() to anon, authenticated;

-- England totals for the headline + reduction blocks. Reuses national_rivers for the spill rollups
-- and a second lateral over public_spills_reduction for the baseline-vs-latest reduction figure.
create or replace function national_summary()
returns table (
  rivers int, overflows int, gaps int, dry int, hours_lfy int,
  baseline_spills int, latest_spills int
)
language sql stable security definer set search_path = public as $$
  with r as (select * from national_rivers()),
  red as (
    select coalesce(sum(rr.baseline), 0)::int as baseline, coalesce(sum(rr.latest), 0)::int as latest
    from organisations o
    left join lateral public_spills_reduction(o.id) rr on true
    where o.live and o.river_slug is not null
  )
  select
    (select count(*)::int from r),
    (select coalesce(sum(overflows), 0)::int from r),
    (select coalesce(sum(gaps), 0)::int from r),
    (select coalesce(sum(dry), 0)::int from r),
    (select coalesce(sum(hours_lfy), 0)::int from r),
    (select baseline from red),
    (select latest from red);
$$;
grant execute on function national_summary() to anon, authenticated;

notify pgrst, 'reload schema';
