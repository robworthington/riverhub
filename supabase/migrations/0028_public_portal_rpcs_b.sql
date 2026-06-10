-- River Hub — public portal data layer (Phase 1b: sewage spills + council areas).
-- Read-only, anon-granted, SECURITY DEFINER, single-org (Friends of the Dart). Curated.
-- ORG = '00000000-0000-0000-0000-000000000001'.

-- ---------- bathing-water classification in SQL (mirrors src/lib/bathing.ts) ----------
-- Log-normal percentile method: P95=10^(mean(log10)+1.645·sd), P90 with 1.282; sample sd; >=10 needed.
create or replace function bw_class(p_vals numeric[], p_tidal boolean, p_analyte text)
returns text language sql immutable as $$
  with x as (select log(v) lg from unnest(coalesce(p_vals, '{}'::numeric[])) v where v > 0),
  s as (select count(*) n, avg(lg) m, stddev_samp(lg) sd from x),
  pct as (
    select n,
      power(10, m + 1.645 * coalesce(sd, 0)) p95,
      power(10, m + 1.282 * coalesce(sd, 0)) p90
    from s
  )
  select case
    when (select n from s) < 10 then 'Insufficient data'
    when p95 <= (case when p_tidal then (case when p_analyte='ie' then 100 else 250 end) else (case when p_analyte='ie' then 200 else 500 end) end) then 'Excellent'
    when p95 <= (case when p_tidal then (case when p_analyte='ie' then 200 else 500 end) else (case when p_analyte='ie' then 400 else 1000 end) end) then 'Good'
    when p90 <= (case when p_tidal then (case when p_analyte='ie' then 185 else 500 end) else (case when p_analyte='ie' then 330 else 900 end) end) then 'Sufficient'
    else 'Poor' end
  from pct;
$$;

-- worst (most polluted) of two analyte classes, ignoring "Insufficient data" unless both are.
create or replace function bw_worst(a text, b text)
returns text language sql immutable as $$
  select coalesce(
    (select c from (values ('Poor',0),('Sufficient',1),('Good',2),('Excellent',3)) t(c, ord)
     where c in (a, b) order by ord limit 1),
    'Insufficient data');
$$;

-- ---------- assets (public spills section + map) ----------
create or replace function public_assets()
returns table (id uuid, name text, asset_type text, system_id uuid, system_name text,
               lat double precision, lng double precision, status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  with latest_snap as (
    select distinct on (asset_id) asset_id, status from edm_snapshots
    where organisation_id='00000000-0000-0000-0000-000000000001'
    order by asset_id, captured_at desc
  ),
  latest_ann as (
    select distinct on (asset_id) asset_id, year, spill_count from edm_annual_stats
    where organisation_id='00000000-0000-0000-0000-000000000001' and asset_id is not null
    order by asset_id, year desc
  )
  select a.id, a.asset_name, a.asset_type::text, a.sewage_system_id, sy.name,
         a.latitude, a.longitude, ls.status, la.spill_count, la.year
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join latest_ann la on la.asset_id = a.id
  where a.organisation_id='00000000-0000-0000-0000-000000000001'
  order by a.asset_name;
$$;
grant execute on function public_assets() to anon, authenticated;

-- annual spill trend for one asset (spills + hours from returns; dry/wet/unknown from classification)
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
    where organisation_id='00000000-0000-0000-0000-000000000001' and asset_id = p_asset
  )
  select coalesce(ann.year, c.yr), ann.spill_count, ann.hours, c.dry, c.wet, c.unknown
  from ann full outer join cls_agg c on c.yr = ann.year
  order by 1;
$$;
grant execute on function public_asset_annual(uuid) to anon, authenticated;

-- per-asset dry-spill summary for a year (wraps dry_spill_summary)
create or replace function public_dry_spills(p_year int)
returns table (asset_id uuid, asset_name text, system_name text, dry int, wet int, unknown int, total int)
language sql stable security definer set search_path = public as $$
  select * from dry_spill_summary(1, 0.25, p_year);
$$;
grant execute on function public_dry_spills(int) to anon, authenticated;

-- spills ahead of the works for a system + year (wraps spills_ahead_of_works)
create or replace function public_spills_ahead(p_system uuid, p_year int)
returns table (asset_id uuid, asset_name text, asset_type text, total int, ahead int, pct int)
language sql stable security definer set search_path = public as $$
  select * from spills_ahead_of_works(p_system, p_year, 0);
$$;
grant execute on function public_spills_ahead(uuid, int) to anon, authenticated;

-- ---------- council navigation ----------
create or replace function public_districts()
returns table (district text, parishes int, population int)
language sql stable security definer set search_path = public as $$
  select district, count(*)::int, sum(census_2021_population)::int
  from parishes where boundary is not null
  group by district order by district;
$$;
grant execute on function public_districts() to anon, authenticated;

create or replace function public_parishes()
returns table (id uuid, name text, district text, population int)
language sql stable security definer set search_path = public as $$
  select id, name, district, census_2021_population
  from parishes where boundary is not null order by name;
$$;
grant execute on function public_parishes() to anon, authenticated;

-- ---------- council area detail (parish or set of parishes = district) ----------
create or replace function public_area_overview(p_ids uuid[])
returns table (population int, boundary text, parish_names text)
language sql stable security definer set search_path = public as $$
  select sum(census_2021_population)::int,
         ST_AsGeoJSON(ST_Union(boundary)),
         string_agg(name, ', ' order by name)
  from parishes where id = any(p_ids) and boundary is not null;
$$;
grant execute on function public_area_overview(uuid[]) to anon, authenticated;

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
    where s.organisation_id='00000000-0000-0000-0000-000000000001' and s.parish_id = any(p_ids)
    group by s.id, s.name, s.type, s.tidal, s.latitude, s.longitude
  )
  select id, name, typ, tidal, latitude, longitude, n,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie'))
  from res order by name;
$$;
grant execute on function public_area_sites(uuid[]) to anon, authenticated;

create or replace function public_area_assets(p_ids uuid[])
returns table (id uuid, name text, asset_type text, lat double precision, lng double precision,
               status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  with latest_snap as (
    select distinct on (asset_id) asset_id, status from edm_snapshots
    where organisation_id='00000000-0000-0000-0000-000000000001' order by asset_id, captured_at desc
  ),
  latest_ann as (
    select distinct on (asset_id) asset_id, year, spill_count from edm_annual_stats
    where organisation_id='00000000-0000-0000-0000-000000000001' and asset_id is not null order by asset_id, year desc
  )
  select a.id, a.asset_name, a.asset_type::text, a.latitude, a.longitude, ls.status, la.spill_count, la.year
  from sewage_assets a
  left join latest_snap ls on ls.asset_id = a.id
  left join latest_ann la on la.asset_id = a.id
  where a.organisation_id='00000000-0000-0000-0000-000000000001' and a.parish_id = any(p_ids)
  order by a.asset_name;
$$;
grant execute on function public_area_assets(uuid[]) to anon, authenticated;

-- STW capacity rows for an area (mirrors getAreaData stw logic)
create or replace function public_area_stw(p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text,
               demand_central numeric, pct_remaining int)
language sql stable security definer set search_path = public as $$
  with stw as (
    select a.id, a.asset_name, a.sewage_system_id, a.processing_capacity, a.actual_capacity_m3d
    from sewage_assets a
    where a.organisation_id='00000000-0000-0000-0000-000000000001'
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
grant execute on function public_area_stw(uuid[]) to anon, authenticated;
