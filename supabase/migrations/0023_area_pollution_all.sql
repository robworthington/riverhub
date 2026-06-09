-- River Hub — area_pollution v2: return ALL parishes / districts (with a boundary), not just those
-- with data, so the choropleth shows full coverage (grey "no data" where there are no results).
-- Previously a parish only appeared if it contained a geolocated, tested site → many looked missing.

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
    select pp.id as pid, pp.district, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    join parishes pp on pp.id = s.parish_id
    where r.test_type_id = p_type and r.result is not null
      and (p_from is null or r.date_collected >= p_from)
      and (p_to   is null or r.date_collected <= p_to)
  ),
  parish_agg as (
    select pid,
           count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result), 1) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian,
           avg((tidal)::int) > 0.5 tm
    from res group by pid
  ),
  dist_agg as (
    select district,
           count(*)::int n, min(result) vmin, max(result) vmax, round(avg(result), 1) vmean,
           percentile_cont(0.5) within group (order by result)::numeric vmedian,
           avg((tidal)::int) > 0.5 tm
    from res group by district
  )
  select p.id::text, p.name,
         coalesce(pa.n, 0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, coalesce(pa.tm, false),
         ST_AsGeoJSON(p.boundary)
  from parishes p
  left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish' and p.boundary is not null
  union all
  select d.district, d.district,
         coalesce(da.n, 0), da.vmin, da.vmax, da.vmean, da.vmedian, coalesce(da.tm, false),
         dg.geojson
  from (select distinct district from parishes where boundary is not null) d
  join (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson
        from parishes where boundary is not null group by district) dg on dg.district = d.district
  left join dist_agg da on da.district = d.district
  where p_level = 'district';
$$;

grant execute on function area_pollution(text, uuid, date, date) to authenticated;
