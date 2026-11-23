-- 0093 national rollup table — make the national summary/chooser scale past a handful of rivers.
--
-- national_rivers() and national_summary() computed a per-org LATERAL over public_spills_problems()
-- (+ public_spills_reduction() for the summary) across EVERY live org on each call. Cost is linear in
-- live-river count: ~1.5-2.2s at 2 rivers, but ~18s (national_rivers) / ~29s (national_summary) at 29
-- rivers — past the 30s statement_timeout (0091) and well past what the ISR `/` render can wait for, so
-- the national summary page and chooser fell back to EMPTY (0 rivers) once the SWW batch went live.
--
-- Fix: precompute the per-org rollup into a small TABLE, refreshed periodically by the hourly edm-sync
-- cron (refresh_national_rollup()); national_rivers()/national_summary() now read that table (joined to
-- organisations for the live filter + branding, which stay current with no refresh). The heavy lateral
-- work happens once per hour in the cron instead of on every page render, so the RPCs return in ms.
--
-- A TABLE + upsert (not a MATERIALIZED VIEW) on purpose: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot be
-- called from inside a function/transaction (which is how the cron must invoke it), and a non-concurrent
-- REFRESH takes an ACCESS EXCLUSIVE lock that would block page reads for the whole ~29s rebuild. An upsert
-- takes only row locks, so readers keep seeing the previous values until it commits.

create table if not exists national_river_rollup (
  org_id       uuid primary key references organisations(id) on delete cascade,
  overflows    int not null default 0,
  gaps         int not null default 0,
  dry          int not null default 0,
  hours_lfy    int not null default 0,
  baseline     int not null default 0,
  latest       int not null default 0,
  refreshed_at timestamptz not null default now()
);

-- Read only ever happens through the SECURITY DEFINER RPCs below (owner bypasses RLS); deny direct access.
alter table national_river_rollup enable row level security;

-- Recompute the rollup for every org with a river_slug (live or not, so a newly-live river already has a
-- row by its next refresh). Upsert in place; prune orgs that no longer qualify. The source functions are
-- the same ones the per-river board uses, so the numbers match a live computation exactly.
create or replace function refresh_national_rollup()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
begin
  -- public_spills_problems() and public_spills_reduction() each return several rows per org; joining both
  -- laterals in ONE grouped query cross-multiplies them and corrupts every aggregate. Compute each per-org
  -- aggregate separately, then join on org_id (one row per org from each side). reduction is SUMmed per org
  -- to match the original national_summary() `red` CTE (sum(rr.baseline)).
  insert into national_river_rollup as t
    (org_id, overflows, gaps, dry, hours_lfy, baseline, latest, refreshed_at)
  select prob.org_id, prob.overflows, prob.gaps, prob.dry, prob.hours_lfy,
         coalesce(red.baseline, 0), coalesce(red.latest, 0), now()
  from (
    select o.id as org_id,
           count(p.*)::int as overflows,
           count(*) filter (where p.weight > 0 and not p.has_action)::int as gaps,
           coalesce(sum(p.dry), 0)::int as dry,
           coalesce(sum(p.hours_lfy), 0)::int as hours_lfy
    from organisations o
    left join lateral public_spills_problems(o.id) p on true
    where o.river_slug is not null
    group by o.id
  ) prob
  join (
    select o.id as org_id,
           coalesce(sum(rr.baseline), 0)::int as baseline,
           coalesce(sum(rr.latest), 0)::int as latest
    from organisations o
    left join lateral public_spills_reduction(o.id) rr on true
    where o.river_slug is not null
    group by o.id
  ) red using (org_id)
  on conflict (org_id) do update set
    overflows    = excluded.overflows,
    gaps         = excluded.gaps,
    dry          = excluded.dry,
    hours_lfy    = excluded.hours_lfy,
    baseline     = excluded.baseline,
    latest       = excluded.latest,
    refreshed_at = excluded.refreshed_at;

  delete from national_river_rollup x
  where not exists (
    select 1 from organisations o where o.id = x.org_id and o.river_slug is not null
  );
end;
$$;

-- The cron (service_role) refreshes it; the public read RPCs don't need it (they read the table directly
-- as the definer-owner).
grant execute on function refresh_national_rollup() to service_role;

-- national_rivers(): one row per live river, metrics read from the rollup, branding/live from organisations.
create or replace function national_rivers()
returns table(slug text, river_name text, region text, org_name text, overflows integer, gaps integer, dry integer, hours_lfy integer, logo_url text)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select o.river_slug, o.river_name, o.region, o.name,
         coalesce(x.overflows, 0),
         coalesce(x.gaps, 0),
         coalesce(x.dry, 0),
         coalesce(x.hours_lfy, 0),
         o.logo_url
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  where o.live and o.river_slug is not null
  order by coalesce(x.gaps, 0) desc, o.river_name;
$function$;

-- national_summary(): national totals, summed from the same rollup over live rivers.
create or replace function national_summary()
returns table(rivers integer, overflows integer, gaps integer, dry integer, hours_lfy integer, baseline_spills integer, latest_spills integer)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select
    count(*)::int,
    coalesce(sum(x.overflows), 0)::int,
    coalesce(sum(x.gaps), 0)::int,
    coalesce(sum(x.dry), 0)::int,
    coalesce(sum(x.hours_lfy), 0)::int,
    coalesce(sum(x.baseline), 0)::int,
    coalesce(sum(x.latest), 0)::int
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  where o.live and o.river_slug is not null;
$function$;

grant execute on function national_rivers() to anon, authenticated;
grant execute on function national_summary() to anon, authenticated;
