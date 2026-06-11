-- River Hub — F1 federation-readiness: de-hardcode the organisation.
--
-- The public-portal RPCs (0027/0028/0029) baked the Friends-of-the-Dart uuid into every query,
-- which blocks stamping new instances from the template. This adds a single-row app_config table
-- + a public_org() accessor, and recreates all public_* functions to read it. Queries reference it
-- as `(select public_org())` so the planner evaluates it once per statement (InitPlan), keeping the
-- river RPC inside the anon 3s statement_timeout.
--
-- Behaviour is identical on this instance (one organisation). Fresh instances: create the
-- organisation row first, then insert app_config (the conditional insert below self-seeds when
-- exactly one organisation exists at migration time).

-- ---------- config ----------
create table if not exists app_config (
  single     boolean primary key default true check (single),
  public_org uuid not null references organisations(id)
);
alter table app_config enable row level security;
-- no RLS policies: reached only via the security-definer accessor (and service role).

insert into app_config (public_org)
select id from organisations order by created_at limit 1
on conflict (single) do nothing;

create or replace function public_org()
returns uuid language sql stable security definer set search_path = public as $$
  select public_org from app_config limit 1;
$$;
grant execute on function public_org() to anon, authenticated;

-- ---------- recreate public RPCs (0027) without the org literal ----------
create or replace function public_test_types()
returns table (id uuid, test_name text, primary_unit text)
language sql stable security definer set search_path = public as $$
  select id, test_name, primary_unit from test_types
  where organisation_id = (select public_org())
    and (test_name ilike '%coli%' or test_name ilike '%enterococci%')
  order by test_name;
$$;

create or replace function public_area_pollution(p_level text, p_type uuid default null)
returns table (area_key text, name text, n int, vmin numeric, vmax numeric, vmean numeric, vmedian numeric, tidal_majority boolean, geojson text)
language sql stable security definer set search_path = public as $$
  with res as (
    select pp.id as pid, pp.district, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    join parishes pp on pp.id = s.parish_id
    where s.organisation_id = (select public_org()) and r.result is not null
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

create or replace function public_site_pollution(p_type uuid default null)
returns table (site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n int, vmedian numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.latitude, s.longitude, s.tidal, count(r.result)::int,
         percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s join test_results r on r.site_id = s.id
  where s.organisation_id = (select public_org()) and r.result is not null
    and s.latitude is not null and s.longitude is not null
    and ((p_type is not null and r.test_type_id = p_type)
      or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$$;

create or replace function public_sites()
returns table (id uuid, name text, type text, tidal boolean, latitude double precision, longitude double precision, parish text, samples int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.type::text, s.tidal, s.latitude, s.longitude, p.name,
         (select count(*) from test_results r where r.site_id = s.id)::int
  from test_sites s left join parishes p on p.id = s.parish_id
  where s.organisation_id = (select public_org())
  order by s.name;
$$;

create or replace function public_site_results(p_site uuid)
returns table (date_collected date, test_name text, primary_unit text, result numeric, result_qualifier text,
               condition text, observed_weather text, collected_by text)
language sql stable security definer set search_path = public as $$
  select r.date_collected, tt.test_name, tt.primary_unit, r.result, r.result_qualifier,
         r.condition::text, r.observed_weather, r.organisation_collecting
  from test_results r
  join test_sites s on s.id = r.site_id
  join test_types tt on tt.id = r.test_type_id
  where s.organisation_id = (select public_org()) and r.site_id = p_site
  order by r.date_collected desc;
$$;

-- ---------- recreate public RPCs (0028) without the org literal ----------
create or replace function public_assets()
returns table (id uuid, name text, asset_type text, system_id uuid, system_name text,
               lat double precision, lng double precision, status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  with latest_snap as (
    select distinct on (asset_id) asset_id, status from edm_snapshots
    where organisation_id = (select public_org())
    order by asset_id, captured_at desc
  ),
  latest_ann as (
    select distinct on (asset_id) asset_id, year, spill_count from edm_annual_stats
    where organisation_id = (select public_org()) and asset_id is not null
    order by asset_id, year desc
  )
  select a.id, a.asset_name, a.asset_type::text, a.sewage_system_id, sy.name,
         a.latitude, a.longitude, ls.status, la.spill_count, la.year
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join latest_ann la on la.asset_id = a.id
  where a.organisation_id = (select public_org())
  order by a.asset_name;
$$;

create or replace function public_asset_annual(p_asset uuid)
returns table (year int, spills numeric, hours numeric, dry int, wet int, unknown int)
language sql stable security definer set search_path = public as $$
  with cls as (
    select extract(year from event_start)::int yr, weather_class
    from classify_spills(1, 0.25, p_asset, null)
  ),
  cls_agg as (
    select yr, count(*) filter (where weather_class='dry')::int dry,
                count(*) filter (where weather_class='wet')::int wet,
                count(*) filter (where weather_class='unknown')::int unknown
    from cls group by yr
  ),
  ann as (
    select year, spill_count, round(total_duration_hours) hours
    from edm_annual_stats
    where organisation_id = (select public_org()) and asset_id = p_asset
  )
  select coalesce(ann.year, c.yr), ann.spill_count, ann.hours, c.dry, c.wet, c.unknown
  from ann full outer join cls_agg c on c.yr = ann.year
  order by 1;
$$;

create or replace function public_area_sites(p_ids uuid[])
returns table (id uuid, name text, type text, tidal boolean, lat double precision, lng double precision, samples int, klass text)
language sql stable security definer set search_path = public as $$
  with res as (
    select s.id, s.name, s.type::text typ, s.tidal, s.latitude, s.longitude,
      array_agg(r.result) filter (where tt.test_name = 'E. coli (culture)' and r.result is not null) ec,
      array_agg(r.result) filter (where tt.test_name = 'Intestinal enterococci (culture)' and r.result is not null) ie,
      count(r.*)::int n
    from test_sites s
    left join test_results r on r.site_id = s.id
    left join test_types tt on tt.id = r.test_type_id
    where s.organisation_id = (select public_org()) and s.parish_id = any(p_ids)
    group by s.id, s.name, s.type, s.tidal, s.latitude, s.longitude
  )
  select id, name, typ, tidal, latitude, longitude, n,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie'))
  from res order by name;
$$;

create or replace function public_area_assets(p_ids uuid[])
returns table (id uuid, name text, asset_type text, lat double precision, lng double precision,
               status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  with latest_snap as (
    select distinct on (asset_id) asset_id, status from edm_snapshots
    where organisation_id = (select public_org()) order by asset_id, captured_at desc
  ),
  latest_ann as (
    select distinct on (asset_id) asset_id, year, spill_count from edm_annual_stats
    where organisation_id = (select public_org()) and asset_id is not null order by asset_id, year desc
  )
  select a.id, a.asset_name, a.asset_type::text, a.latitude, a.longitude, ls.status, la.spill_count, la.year
  from sewage_assets a
  left join latest_snap ls on ls.asset_id = a.id
  left join latest_ann la on la.asset_id = a.id
  where a.organisation_id = (select public_org()) and a.parish_id = any(p_ids)
  order by a.asset_name;
$$;

create or replace function public_area_stw(p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text,
               demand_central numeric, pct_remaining int)
language sql stable security definer set search_path = public as $$
  with stw as (
    select a.id, a.asset_name, a.sewage_system_id, a.processing_capacity, a.actual_capacity_m3d
    from sewage_assets a
    where a.organisation_id = (select public_org())
      and a.parish_id = any(p_ids) and a.asset_type = 'sewage_treatment_works'
  ),
  permit as (
    select distinct on (asset_id) asset_id, permit_dwf_m3d, required_processing_volume
    from asset_permits order by asset_id, created_at desc
  )
  select stw.id, stw.asset_name, sy.name,
    coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d, p.required_processing_volume, stw.processing_capacity) cap,
    case when stw.actual_capacity_m3d is not null then 'installed capacity (EIR)'
         when p.permit_dwf_m3d is not null then 'permit DWF'
         when p.required_processing_volume is not null then 'permit (required processing)'
         when stw.processing_capacity is not null then 'processing capacity' end,
    cv.demand_central_m3d,
    case when coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d, p.required_processing_volume, stw.processing_capacity) > 0
              and cv.demand_central_m3d is not null
         then round((1 - cv.demand_central_m3d / coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d, p.required_processing_volume, stw.processing_capacity)) * 100)::int
    end
  from stw
  left join sewage_systems sy on sy.id = stw.sewage_system_id
  left join permit p on p.asset_id = stw.id
  left join system_capacity_v cv on cv.system_id = stw.sewage_system_id
  order by stw.asset_name;
$$;

-- ---------- recreate public_river_pollution (0029) without the org literal ----------
create or replace function public_river_pollution(p_type uuid default null, p_max_dist_m int default 500)
returns table (segment_id uuid, name text, geojson text, n int, vmedian numeric, tidal boolean, nearest_site text, dist_m int)
language sql stable security definer set search_path = public as $$
  with sitestats as (
    select s.id, s.name, s.tidal, ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n, percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s join test_results r on r.site_id = s.id
    where s.organisation_id = (select public_org()) and r.result is not null
      and s.latitude is not null and s.longitude is not null
      and ((p_type is not null and r.test_type_id = p_type)
        or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
    group by s.id, s.name, s.tidal, g
  ),
  candidates as (
    select rs.id, rs.name, rs.geom
    from river_segments rs
    where exists (
      select 1 from test_sites s2
      where s2.organisation_id = (select public_org()) and s2.location is not null
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
