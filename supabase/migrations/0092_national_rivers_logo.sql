-- Add logo_url to national_rivers() so the national summary's chooser cards can show each river's mark.
-- Changing a function's RETURNS TABLE needs drop+create (create-or-replace can't alter the output type),
-- and national_summary() depends on national_rivers() (it does `select * from national_rivers()`), so drop
-- the dependant first and recreate both. The bodies are unchanged except for the added logo_url column on
-- national_rivers; national_summary selects its columns by name so it is carried over verbatim.
-- Re-applies the per-function statement_timeout from 0091 (dropped with the functions).
-- National-mode only (instance deployments never call these), so harmless on release-v1.
drop function if exists national_summary();
drop function if exists national_rivers();

create function national_rivers()
returns table (
  slug text, river_name text, region text, org_name text,
  overflows int, gaps int, dry int, hours_lfy int, logo_url text
)
language sql stable security definer set search_path = public as $$
  select o.river_slug, o.river_name, o.region, o.name,
         count(p.*)::int,
         count(*) filter (where p.weight > 0 and not p.has_action)::int,
         coalesce(sum(p.dry), 0)::int,
         coalesce(sum(p.hours_lfy), 0)::int,
         o.logo_url
  from organisations o
  left join lateral public_spills_problems(o.id) p on true
  where o.live and o.river_slug is not null
  group by o.id, o.river_slug, o.river_name, o.region, o.name, o.logo_url
  order by count(*) filter (where p.weight > 0 and not p.has_action) desc, o.river_name;
$$;
grant execute on function national_rivers() to anon, authenticated;

create function national_summary()
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

alter function national_summary() set statement_timeout = '30s';
alter function national_rivers()  set statement_timeout = '30s';

notify pgrst, 'reload schema';
