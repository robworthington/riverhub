-- River Hub — EA water-quality pollution layers for the heatmap (nutrient/chemistry determinands).
-- Aggregates per-sample EA observations (ea_wq_samples) by parish/district (point-in-polygon) and by
-- sampling point, for a chosen determinand. Mirrors area_pollution / site_pollution shapes so the
-- heatmap can reuse its rendering. SECURITY DEFINER over public_org() so both the members heatmap and
-- the public map can call it (EA data is OGL public). See WATER-TESTING-DATA-SOURCES.md.

create or replace function ea_area_pollution(p_level text, p_determinand text)
returns table (area_key text, name text, n int, vmin numeric, vmax numeric, vmean numeric,
               vmedian numeric, tidal_majority boolean, geojson text)
language sql stable security definer set search_path = public as $$
  with res as (
    select pp.id as pid, pp.district, e.result
    from ea_wq_samples e
    join parishes pp on pp.boundary is not null and ST_Contains(pp.boundary, e.location::geometry)
    where e.organisation_id = public_org() and e.determinand = p_determinand and e.result is not null
  ),
  parish_agg as (
    select pid, count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result)::numeric, 3) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian
    from res group by pid
  ),
  dist_agg as (
    select district, count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result)::numeric, 3) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian
    from res group by district
  )
  select p.id::text, p.name, coalesce(pa.n, 0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, false,
         ST_AsGeoJSON(p.boundary)
  from parishes p left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish' and p.boundary is not null
  union all
  select d.district, d.district, coalesce(da.n, 0), da.vmin, da.vmax, da.vmean, da.vmedian, false, dg.geojson
  from (select distinct district from parishes where boundary is not null) d
  join (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson from parishes where boundary is not null group by district) dg
    on dg.district = d.district
  left join dist_agg da on da.district = d.district
  where p_level = 'district';
$$;
grant execute on function ea_area_pollution(text, text) to anon, authenticated;

create or replace function ea_site_pollution(p_determinand text)
returns table (site_id text, name text, lat double precision, lng double precision, tidal boolean,
               n int, vmedian numeric)
language sql stable security definer set search_path = public as $$
  select notation, max(coalesce(site_label, notation)), max(latitude), max(longitude), false,
         count(*)::int, percentile_cont(0.5) within group (order by result)::numeric
  from ea_wq_samples
  where organisation_id = public_org() and determinand = p_determinand and result is not null
    and latitude is not null and longitude is not null
  group by notation;
$$;
grant execute on function ea_site_pollution(text) to anon, authenticated;
