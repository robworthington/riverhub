-- 0094 river basin districts — the regional lens for the national site (national navigation, step 2).
--
-- The Environment Agency plans and reports river health by river basin district (RBD), the Water
-- Framework Directive's planning unit: 10 in England (three of them cross into Wales or Scotland). Each
-- river is placed in the district that most of its overflows sit in, so the national site can group
-- rivers England > district > river and show a district page (/d/<slug>).
--
-- `organisations.region` is left alone: it currently holds an area for most rivers ("South West") and a
-- water company for one ("Wessex"), so it can't serve as either. The district is a separate, derived
-- column; the company already lives in `company_name`.
--
-- Boundaries are reference data, loaded by scripts/import_river_basin_districts.py (EA WFD Cycle 2
-- operational catchments, merged per district), not by this migration.

create table if not exists river_basin_districts (
  id         int primary key,            -- EA rbd_id (WFD Cycle 2)
  slug       text not null unique,       -- url segment: /d/<slug>
  name       text not null,
  geom       geometry(MultiPolygon, 4326),
  loaded_at  timestamptz not null default now()
);
create index if not exists river_basin_districts_geom_idx on river_basin_districts using gist (geom);

-- Read only through the SECURITY DEFINER RPCs below.
alter table river_basin_districts enable row level security;

alter table organisations add column if not exists rbd_id int references river_basin_districts(id);

-- Place each river in a district: the district containing most of its located overflows. An overflow
-- outside every boundary (estuary and coastal outfalls sit just off the land polygons) counts for the
-- nearest district. Rivers already placed keep their district unless p_force.
create or replace function assign_river_districts(p_force boolean default false)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_placed int;
begin
  if not exists (select 1 from river_basin_districts where geom is not null) then
    return 0;
  end if;

  with pts as (
    select a.organisation_id as org_id,
           ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326) as g
    from sewage_assets a
    join organisations o on o.id = a.organisation_id
    where o.river_slug is not null
      and (p_force or o.rbd_id is null)
      and a.latitude is not null and a.longitude is not null
  ),
  votes as (
    select p.org_id, d.id as rbd_id, count(*) as n
    from pts p
    cross join lateral (
      select r.id from river_basin_districts r
      where r.geom is not null
      -- true distance (0 inside), not the bounding-box <-> operator: a dozen polygons, and bbox order
      -- can pick the wrong district for an outfall just offshore.
      order by ST_Distance(r.geom, p.g)
      limit 1
    ) d
    group by 1, 2
  ),
  winner as (
    select distinct on (org_id) org_id, rbd_id
    from votes
    order by org_id, n desc, rbd_id
  )
  update organisations o set rbd_id = w.rbd_id
  from winner w
  where o.id = w.org_id and o.rbd_id is distinct from w.rbd_id;

  get diagnostics v_placed = row_count;
  return v_placed;
end;
$$;

grant execute on function assign_river_districts(boolean) to service_role;

-- The hourly cron's refresh also places any newly onboarded river, so a new river lands in its
-- district with no manual step. Body otherwise identical to 0093.
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
end;
$$;

-- national_rivers() gains the district, the company and a map point (the river's configured map centre,
-- else the middle of its overflows), plus an optional district filter. The return type changes, so the
-- old function is dropped first; calling it with no arguments behaves as before.
drop function if exists national_rivers();

create or replace function national_rivers(p_district text default null)
returns table(
  slug text, river_name text, region text, org_name text,
  overflows integer, gaps integer, dry integer, hours_lfy integer, logo_url text,
  company_name text, district_slug text, district_name text, lat double precision, lng double precision
)
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
         o.logo_url,
         o.company_name,
         d.slug, d.name,
         coalesce(o.map_centre_lat, c.lat),
         coalesce(o.map_centre_lng, c.lng)
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  left join river_basin_districts d on d.id = o.rbd_id
  left join lateral (
    select avg(a.latitude)::double precision as lat, avg(a.longitude)::double precision as lng
    from sewage_assets a where a.organisation_id = o.id and a.latitude is not null
  ) c on true
  where o.live and o.river_slug is not null
    and (p_district is null or d.slug = p_district)
  order by coalesce(x.gaps, 0) desc, o.river_name;
$function$;

-- national_districts(): every district, with totals over its live rivers (0 where none are covered yet)
-- and the water companies serving them.
create or replace function national_districts()
returns table(
  slug text, name text, rivers integer, overflows integer, gaps integer, dry integer,
  companies text[]
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select d.slug, d.name,
         count(o.id)::int,
         coalesce(sum(x.overflows), 0)::int,
         coalesce(sum(x.gaps), 0)::int,
         coalesce(sum(x.dry), 0)::int,
         coalesce(array_agg(distinct o.company_name order by o.company_name)
                  filter (where o.company_name is not null), '{}')
  from river_basin_districts d
  left join organisations o on o.rbd_id = d.id and o.live and o.river_slug is not null
  left join national_river_rollup x on x.org_id = o.id
  group by d.id, d.slug, d.name
  order by count(o.id) desc, d.name;
$function$;

-- public_district(slug): one district's totals, companies and outline (GeoJSON, for the map).
create or replace function public_district(p_slug text)
returns table(
  slug text, name text, rivers integer, overflows integer, gaps integer, dry integer,
  hours_lfy integer, baseline_spills integer, latest_spills integer, companies text[], boundary text
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select d.slug, d.name,
         count(o.id)::int,
         coalesce(sum(x.overflows), 0)::int,
         coalesce(sum(x.gaps), 0)::int,
         coalesce(sum(x.dry), 0)::int,
         coalesce(sum(x.hours_lfy), 0)::int,
         coalesce(sum(x.baseline), 0)::int,
         coalesce(sum(x.latest), 0)::int,
         coalesce(array_agg(distinct o.company_name order by o.company_name)
                  filter (where o.company_name is not null), '{}'),
         ST_AsGeoJSON(d.geom, 4)
  from river_basin_districts d
  left join organisations o on o.rbd_id = d.id and o.live and o.river_slug is not null
  left join national_river_rollup x on x.org_id = o.id
  where d.slug = p_slug
  group by d.id, d.slug, d.name, d.geom;
$function$;

grant execute on function national_rivers(text) to anon, authenticated;
grant execute on function national_districts() to anon, authenticated;
grant execute on function public_district(text) to anon, authenticated;

notify pgrst, 'reload schema';
