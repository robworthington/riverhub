-- River Hub — make public_river_pollution fast enough for the anon API timeout.
--
-- The original computed the nearest monitored site for EVERY river segment (thousands), then
-- discarded the ~95% with no site within range. On the smaller prod instance that ran ~6-12s,
-- exceeding the anon role's 3s statement_timeout, so the public map's "River stretches" layer
-- silently returned empty. This pre-filters segments to those within p_max_dist_m of a site using
-- the GiST index on test_sites.location, cutting the work ~9x (≈2.0s -> ≈0.2s locally). Same output.
-- ORG = Friends of the Dart.

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
  ),
  -- only segments near at least one monitored site (uses the GiST index on test_sites.location)
  candidates as (
    select rs.id, rs.name, rs.geom
    from river_segments rs
    where exists (
      select 1 from test_sites s2
      where s2.organisation_id = '00000000-0000-0000-0000-000000000001' and s2.location is not null
        and ST_DWithin(rs.geom::geography, s2.location, p_max_dist_m)
    )
  )
  select c.id, c.name, ST_AsGeoJSON(c.geom), ns.n, ns.med, ns.tidal, ns.name, ns.d::int
  from candidates c
  cross join lateral (
    select ss.name, ss.tidal, ss.n, ss.med, ST_Distance(ss.g::geography, c.geom::geography) as d
    from sitestats ss order by ss.g <-> c.geom limit 1
  ) ns
  where ns.d <= p_max_dist_m;
$$;
grant execute on function public_river_pollution(uuid, int) to anon, authenticated;
