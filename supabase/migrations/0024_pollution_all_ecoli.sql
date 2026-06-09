-- River Hub — let the pollution layers pool ALL E. coli methods.
-- When p_type IS NULL, match every E. coli test type (culture + Petrifilm) instead of one, so the
-- map's default "E. coli (all methods)" view shows every monitored area (e.g. Petrifilm-only
-- parishes like Broadhempston). When p_type is given, behaviour is unchanged (single type).
-- 'coli' only matches the two E. coli types ('enterococci' has no 'coli' substring).

create or replace function area_pollution(p_level text, p_type uuid, p_from date default null, p_to date default null)
returns table (
  area_key text, name text, n int, vmin numeric, vmax numeric, vmean numeric, vmedian numeric,
  tidal_majority boolean, geojson text
)
language sql stable as $$
  with res as (
    select pp.id as pid, pp.district, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    join parishes pp on pp.id = s.parish_id
    where r.result is not null
      and ((p_type is not null and r.test_type_id = p_type)
        or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
      and (p_from is null or r.date_collected >= p_from)
      and (p_to   is null or r.date_collected <= p_to)
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
  select p.id::text, p.name, coalesce(pa.n,0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, coalesce(pa.tm,false),
         ST_AsGeoJSON(p.boundary)
  from parishes p left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish' and p.boundary is not null
  union all
  select d.district, d.district, coalesce(da.n,0), da.vmin, da.vmax, da.vmean, da.vmedian, coalesce(da.tm,false),
         dg.geojson
  from (select distinct district from parishes where boundary is not null) d
  join (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson from parishes where boundary is not null group by district) dg on dg.district = d.district
  left join dist_agg da on da.district = d.district
  where p_level = 'district';
$$;
grant execute on function area_pollution(text, uuid, date, date) to authenticated;

create or replace function river_pollution(p_type uuid, p_from date default null, p_to date default null, p_max_dist_m int default 500)
returns table (segment_id uuid, name text, geojson text, n int, vmedian numeric, tidal boolean, nearest_site text, dist_m int)
language sql stable as $$
  with sitestats as (
    select s.id, s.name, s.tidal, ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n, percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s
    join test_results r on r.site_id = s.id
    where r.result is not null and s.latitude is not null and s.longitude is not null
      and ((p_type is not null and r.test_type_id = p_type)
        or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
      and (p_from is null or r.date_collected >= p_from)
      and (p_to   is null or r.date_collected <= p_to)
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
grant execute on function river_pollution(uuid, date, date, int) to authenticated;

create or replace function site_pollution(p_type uuid, p_from date default null, p_to date default null)
returns table (site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n int, vmedian numeric)
language sql stable as $$
  select s.id, s.name, s.latitude, s.longitude, s.tidal,
         count(r.result)::int, percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s
  join test_results r on r.site_id = s.id
  where r.result is not null and s.latitude is not null and s.longitude is not null
    and ((p_type is not null and r.test_type_id = p_type)
      or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
    and (p_from is null or r.date_collected >= p_from)
    and (p_to   is null or r.date_collected <= p_to)
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$$;
grant execute on function site_pollution(uuid, date, date) to authenticated;
