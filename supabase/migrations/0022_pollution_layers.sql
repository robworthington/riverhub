-- River Hub — pollution map layers: per-area KPIs (parish/district) and river-stretch colouring.
-- SECURITY INVOKER → RLS scopes results to the caller's org.

-- Per-area pollution KPIs for a test type + optional date range.
-- p_level = 'parish' | 'district'. Returns median/mean/min/max/n + dissolved boundary GeoJSON,
-- and tidal_majority so the UI can pick coastal vs freshwater EA bands.
create or replace function area_pollution(p_level text, p_type uuid, p_from date default null, p_to date default null)
returns table (
  area_key text,
  name     text,
  n        int,
  vmin     numeric,
  vmax     numeric,
  vmean    numeric,
  vmedian  numeric,
  tidal_majority boolean,
  geojson  text
)
language sql
stable
as $$
  with res as (
    select s.parish_id as pid, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    where r.test_type_id = p_type and r.result is not null and s.parish_id is not null
      and (p_from is null or r.date_collected >= p_from)
      and (p_to   is null or r.date_collected <= p_to)
  )
  -- parishes
  select p.id::text, p.name,
         count(x.result)::int,
         min(x.result), max(x.result), round(avg(x.result), 1),
         percentile_cont(0.5) within group (order by x.result)::numeric,
         avg((x.tidal)::int) > 0.5,
         ST_AsGeoJSON(p.boundary)
  from parishes p
  join res x on x.pid = p.id
  where p_level = 'parish' and p.boundary is not null
  group by p.id, p.name, p.boundary
  union all
  -- districts (dissolved parish boundaries)
  select d.district, d.district,
         count(x.result)::int,
         min(x.result), max(x.result), round(avg(x.result), 1),
         percentile_cont(0.5) within group (order by x.result)::numeric,
         avg((x.tidal)::int) > 0.5,
         dg.geojson
  from parishes d
  join res x on x.pid = d.id
  join (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson
        from parishes where boundary is not null group by district) dg on dg.district = d.district
  where p_level = 'district'
  group by d.district, dg.geojson;
$$;

grant execute on function area_pollution(text, uuid, date, date) to authenticated;

-- River-stretch colouring: each river segment takes the median + water-type of its nearest
-- monitored site (within p_max_dist_m). Segments with no nearby site are omitted.
create or replace function river_pollution(p_type uuid, p_from date default null, p_to date default null, p_max_dist_m int default 500)
returns table (
  segment_id  uuid,
  name        text,
  geojson     text,
  n           int,
  vmedian     numeric,
  tidal       boolean,
  nearest_site text,
  dist_m      int
)
language sql
stable
as $$
  with sitestats as (
    select s.id, s.name, s.tidal,
           ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n,
           percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s
    join test_results r on r.site_id = s.id
    where r.test_type_id = p_type and r.result is not null
      and s.latitude is not null and s.longitude is not null
      and (p_from is null or r.date_collected >= p_from)
      and (p_to   is null or r.date_collected <= p_to)
    group by s.id, s.name, s.tidal, g
  )
  select rs.id, rs.name, ST_AsGeoJSON(rs.geom), ns.n, ns.med, ns.tidal, ns.name, ns.d::int
  from river_segments rs
  cross join lateral (
    select ss.name, ss.tidal, ss.n, ss.med,
           ST_Distance(ss.g::geography, rs.geom::geography) as d
    from sitestats ss
    order by ss.g <-> rs.geom
    limit 1
  ) ns
  where ns.d <= p_max_dist_m;
$$;

grant execute on function river_pollution(uuid, date, date, int) to authenticated;

-- Per-site pollution pins (median + water type) for the granular layer.
create or replace function site_pollution(p_type uuid, p_from date default null, p_to date default null)
returns table (site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n int, vmedian numeric)
language sql
stable
as $$
  select s.id, s.name, s.latitude, s.longitude, s.tidal,
         count(r.result)::int,
         percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s
  join test_results r on r.site_id = s.id
  where r.test_type_id = p_type and r.result is not null
    and s.latitude is not null and s.longitude is not null
    and (p_from is null or r.date_collected >= p_from)
    and (p_to   is null or r.date_collected <= p_to)
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$$;
grant execute on function site_pollution(uuid, date, date) to authenticated;
