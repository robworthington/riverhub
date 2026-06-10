-- River Hub — public portal data layer (Phase 1a: pollution map + site water-quality).
-- Read-only, anon-granted, SECURITY DEFINER (so they work without a logged-in profile), single-org
-- (Friends of the Dart). Curated to exclude PII: NO individual collector names, NO internal notes.
-- These are the ONLY way anonymous visitors reach data — everything else stays RLS-gated.

-- Owner (postgres) bypasses non-forced RLS, so definer functions read all rows; we still filter org.
-- ORG = Friends of the Dart.

create or replace function public_test_types()
returns table (id uuid, test_name text, primary_unit text)
language sql stable security definer set search_path = public as $$
  select id, test_name, primary_unit from test_types
  where organisation_id = '00000000-0000-0000-0000-000000000001'
    and (test_name ilike '%coli%' or test_name ilike '%enterococci%')
  order by test_name;
$$;
grant execute on function public_test_types() to anon, authenticated;

create or replace function public_area_pollution(p_level text, p_type uuid default null)
returns table (area_key text, name text, n int, vmin numeric, vmax numeric, vmean numeric, vmedian numeric, tidal_majority boolean, geojson text)
language sql stable security definer set search_path = public as $$
  with res as (
    select pp.id as pid, pp.district, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    join parishes pp on pp.id = s.parish_id
    where s.organisation_id = '00000000-0000-0000-0000-000000000001' and r.result is not null
      and ((p_type is not null and r.test_type_id = p_type)
        or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
  ),
  parish_agg as (
    select pid, count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result),1) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian, avg((tidal)::int) > 0.5 tm
    from res group by pid
  ),
  dist_agg as (
    select district, count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result),1) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian, avg((tidal)::int) > 0.5 tm
    from res group by district
  )
  select p.id::text, p.name, coalesce(pa.n,0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, coalesce(pa.tm,false), ST_AsGeoJSON(p.boundary)
  from parishes p left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish' and p.boundary is not null
  union all
  select d.district, d.district, coalesce(da.n,0), da.vmin, da.vmax, da.vmean, da.vmedian, coalesce(da.tm,false), dg.geojson
  from (select distinct district from parishes where boundary is not null) d
  join (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson from parishes where boundary is not null group by district) dg on dg.district = d.district
  left join dist_agg da on da.district = d.district
  where p_level = 'district';
$$;
grant execute on function public_area_pollution(text, uuid) to anon, authenticated;

create or replace function public_river_pollution(p_type uuid default null, p_max_dist_m int default 500)
returns table (segment_id uuid, name text, geojson text, n int, vmedian numeric, tidal boolean, nearest_site text, dist_m int)
language sql stable security definer set search_path = public as $$
  with sitestats as (
    select s.id, s.name, s.tidal, ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n, percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s join test_results r on r.site_id = s.id
    where s.organisation_id = '00000000-0000-0000-0000-000000000001' and r.result is not null
      and s.latitude is not null and s.longitude is not null
      and ((p_type is not null and r.test_type_id = p_type)
        or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
    group by s.id, s.name, s.tidal, g
  )
  select rs.id, rs.name, ST_AsGeoJSON(rs.geom), ns.n, ns.med, ns.tidal, ns.name, ns.d::int
  from river_segments rs
  cross join lateral (
    select ss.name, ss.tidal, ss.n, ss.med, ST_Distance(ss.g::geography, rs.geom::geography) as d
    from sitestats ss order by ss.g <-> rs.geom limit 1
  ) ns
  where ns.d <= p_max_dist_m;
$$;
grant execute on function public_river_pollution(uuid, int) to anon, authenticated;

create or replace function public_site_pollution(p_type uuid default null)
returns table (site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n int, vmedian numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.latitude, s.longitude, s.tidal, count(r.result)::int,
         percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s join test_results r on r.site_id = s.id
  where s.organisation_id = '00000000-0000-0000-0000-000000000001' and r.result is not null
    and s.latitude is not null and s.longitude is not null
    and ((p_type is not null and r.test_type_id = p_type)
      or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$$;
grant execute on function public_site_pollution(uuid) to anon, authenticated;

-- All sites with their sample count + parish (for the public sites index + site pages)
create or replace function public_sites()
returns table (id uuid, name text, type text, tidal boolean, latitude double precision, longitude double precision, parish text, samples int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.type::text, s.tidal, s.latitude, s.longitude, p.name,
         (select count(*) from test_results r where r.site_id = s.id)::int
  from test_sites s left join parishes p on p.id = s.parish_id
  where s.organisation_id = '00000000-0000-0000-0000-000000000001'
  order by s.name;
$$;
grant execute on function public_sites() to anon, authenticated;

-- Curated results for one site: NO person_collecting, NO other_observations (internal notes).
create or replace function public_site_results(p_site uuid)
returns table (date_collected date, test_name text, primary_unit text, result numeric, result_qualifier text,
               condition text, observed_weather text, collected_by text)
language sql stable security definer set search_path = public as $$
  select r.date_collected, tt.test_name, tt.primary_unit, r.result, r.result_qualifier,
         r.condition::text, r.observed_weather, r.organisation_collecting
  from test_results r
  join test_sites s on s.id = r.site_id
  join test_types tt on tt.id = r.test_type_id
  where s.organisation_id = '00000000-0000-0000-0000-000000000001' and r.site_id = p_site
  order by r.date_collected desc;
$$;
grant execute on function public_site_results(uuid) to anon, authenticated;
