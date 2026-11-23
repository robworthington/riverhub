-- 0096 river neighbours and "rivers near a point" — national navigation, step 3.
--
-- Both are built from the overflows each river already has (sewage_assets lat/lng); no river catchment
-- polygons are needed. "Next to" = the rivers whose nearest overflows are closest to this river's;
-- "near me" = the rivers with an overflow closest to a given point.

-- Precomputed neighbours: up to 5 per river within 60 km, by the shortest distance between any of
-- their overflows. Small table, refreshed with the hourly rollup.
create table if not exists river_neighbours (
  org_id       uuid not null references organisations(id) on delete cascade,
  neighbour_id uuid not null references organisations(id) on delete cascade,
  distance_m   int  not null,
  rank         int  not null,
  primary key (org_id, neighbour_id)
);
alter table river_neighbours enable row level security;

create or replace function refresh_river_neighbours()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60s'
as $$
begin
  delete from river_neighbours;

  with pts as (
    select o.id as org_id,
           ST_Collect(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326))::geography as g
    from organisations o
    join sewage_assets a on a.organisation_id = o.id
    where o.river_slug is not null and a.latitude is not null and a.longitude is not null
    group by o.id
  ),
  pairs as (
    select p1.org_id, p2.org_id as neighbour_id, ST_Distance(p1.g, p2.g)::int as distance_m
    from pts p1
    join pts p2 on p2.org_id <> p1.org_id and ST_DWithin(p1.g, p2.g, 60000)
  ),
  ranked as (
    select *, row_number() over (partition by org_id order by distance_m, neighbour_id) as rank
    from pairs
  )
  insert into river_neighbours (org_id, neighbour_id, distance_m, rank)
  select org_id, neighbour_id, distance_m, rank from ranked where rank <= 5;
end;
$$;

-- Writers are for the cron (service role) only: Postgres/Supabase would otherwise let the anon key run
-- them (see 0095).
revoke execute on function refresh_river_neighbours() from public, anon, authenticated;
grant execute on function refresh_river_neighbours() to service_role;

-- The hourly refresh now also recomputes neighbours (milliseconds at this size). Body otherwise as 0094.
create or replace function refresh_national_rollup()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
begin
  perform assign_river_districts(false);

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

  perform refresh_river_neighbours();
end;
$$;

-- create or replace keeps existing grants, but restate 0095's lock-down so this file stands alone.
revoke execute on function refresh_national_rollup() from public, anon, authenticated;
grant execute on function refresh_national_rollup() to service_role;

-- public_river_neighbours(slug): the live rivers next to this one, nearest first.
create or replace function public_river_neighbours(p_slug text, p_limit int default 3)
returns table(slug text, river_name text, gaps integer, overflows integer, distance_km numeric)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '10s'
as $function$
  select n.river_slug, n.river_name,
         coalesce(x.gaps, 0), coalesce(x.overflows, 0),
         round(rn.distance_m / 1000.0, 1)
  from organisations o
  join river_neighbours rn on rn.org_id = o.id
  join organisations n on n.id = rn.neighbour_id and n.live and n.river_slug is not null
  left join national_river_rollup x on x.org_id = n.id
  where o.river_slug = p_slug
  order by rn.rank
  limit least(greatest(coalesce(p_limit, 3), 1), 5);
$function$;

-- rivers_near(lat, lng): the live rivers with an overflow closest to a point, nearest first. Inputs are
-- clamped to Great Britain and the result count to 10. The point is used for this query only; nothing
-- is stored.
create or replace function rivers_near(p_lat double precision, p_lng double precision, p_limit int default 5)
returns table(
  slug text, river_name text, district_name text, company_name text,
  gaps integer, overflows integer, distance_km numeric
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '10s'
as $function$
  with here as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
    where p_lat between 49.5 and 61 and p_lng between -8.7 and 2
  ),
  per_river as (
    select o.id as org_id, min(ST_Distance(h.g, ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography)) as d
    from here h
    cross join organisations o
    join sewage_assets a on a.organisation_id = o.id
    where o.live and o.river_slug is not null and a.latitude is not null and a.longitude is not null
    group by o.id
  )
  select o.river_slug, o.river_name, d.name, o.company_name,
         coalesce(x.gaps, 0), coalesce(x.overflows, 0),
         round((pr.d / 1000.0)::numeric, 1)
  from per_river pr
  join organisations o on o.id = pr.org_id
  left join river_basin_districts d on d.id = o.rbd_id
  left join national_river_rollup x on x.org_id = o.id
  order by pr.d
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$function$;

grant execute on function public_river_neighbours(text, int) to anon, authenticated;
grant execute on function rivers_near(double precision, double precision, int) to anon, authenticated;

select refresh_river_neighbours();

notify pgrst, 'reload schema';
