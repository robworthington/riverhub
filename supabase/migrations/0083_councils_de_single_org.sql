-- Phase 1 workstream B — de-single-org the COUNCILS (area / district / parish) section.
--
-- Makes the councils RPCs resolve their organisation explicitly so the section renders river-aware
-- under /r/<slug> on a multi-org national DB. Additive / append-only.
--
--  * public_area_assets / public_area_sites / public_area_stw  -> a new (p_org, p_ids) overload
--    (body = original with the org sourced from p_org); the existing (p_ids) version delegates via
--    (select public_org()), so instance mode is unchanged.
--  * public_districts / public_parishes  -> parishes/districts are SHARED national reference data
--    (no organisation_id); the no-arg versions return every reference parish and MUST stay that way
--    for instance mode, so they are left untouched. A new p_org overload scopes the list to parishes
--    that contain that river's assets or test sites — essential so a national /r/<river> councils page
--    lists only its catchment, not all of England.
--  * public_area_overview(p_ids)  -> pure parish-fact aggregation (population/boundary), org-agnostic;
--    unchanged. National routes call it with the (already org-scoped) parish ids from public_parishes.

-- public_area_assets --------------------------------------------------------------------------
create or replace function public_area_assets(p_org uuid, p_ids uuid[])
returns table (id uuid, name text, asset_type text, lat double precision, lng double precision,
               status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  with latest_snap as (
    select distinct on (asset_id) asset_id, status from edm_snapshots
    where organisation_id = p_org order by asset_id, captured_at desc
  ),
  latest_ann as (
    select distinct on (asset_id) asset_id, year, spill_count from edm_annual_stats
    where organisation_id = p_org and asset_id is not null order by asset_id, year desc
  )
  select a.id, a.asset_name, a.asset_type::text, a.latitude, a.longitude, ls.status, la.spill_count, la.year
  from sewage_assets a
  left join latest_snap ls on ls.asset_id = a.id
  left join latest_ann la on la.asset_id = a.id
  where a.organisation_id = p_org and a.parish_id = any(p_ids)
  order by a.asset_name;
$$;
create or replace function public_area_assets(p_ids uuid[])
returns table (id uuid, name text, asset_type text, lat double precision, lng double precision,
               status int, latest_spills numeric, latest_year int)
language sql stable security definer set search_path = public as $$
  select * from public_area_assets((select public_org()), p_ids);
$$;
grant execute on function public_area_assets(uuid, uuid[]) to anon, authenticated;

-- public_area_sites ---------------------------------------------------------------------------
create or replace function public_area_sites(p_org uuid, p_ids uuid[])
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
    where s.organisation_id = p_org and s.parish_id = any(p_ids)
    group by s.id, s.name, s.type, s.tidal, s.latitude, s.longitude
  )
  select id, name, typ, tidal, latitude, longitude, n,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie'))
  from res order by name;
$$;
create or replace function public_area_sites(p_ids uuid[])
returns table (id uuid, name text, type text, tidal boolean, lat double precision, lng double precision, samples int, klass text)
language sql stable security definer set search_path = public as $$
  select * from public_area_sites((select public_org()), p_ids);
$$;
grant execute on function public_area_sites(uuid, uuid[]) to anon, authenticated;

-- public_area_stw -----------------------------------------------------------------------------
create or replace function public_area_stw(p_org uuid, p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text,
               demand_central numeric, pct_remaining int)
language sql stable security definer set search_path = public as $$
  with stw as (
    select a.id, a.asset_name, a.sewage_system_id, a.actual_capacity_m3d
    from sewage_assets a
    where a.organisation_id = p_org
      and a.parish_id = any(p_ids) and a.asset_type = 'sewage_treatment_works'
  ),
  permit as (
    select distinct on (asset_id) asset_id, permit_dwf_m3d
    from asset_permits order by asset_id, created_at desc
  )
  select stw.id, stw.asset_name, sy.name,
    coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d) cap,
    case when stw.actual_capacity_m3d is not null then 'installed capacity (EIR)'
         when p.permit_dwf_m3d is not null then 'permit DWF' end,
    cv.demand_central_m3d,
    case when coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d) > 0
              and cv.demand_central_m3d is not null
         then round((1 - cv.demand_central_m3d / coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d)) * 100)::int
    end
  from stw
  left join sewage_systems sy on sy.id = stw.sewage_system_id
  left join permit p on p.asset_id = stw.id
  left join system_capacity_v cv on cv.system_id = stw.sewage_system_id
  order by stw.asset_name;
$$;
create or replace function public_area_stw(p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text,
               demand_central numeric, pct_remaining int)
language sql stable security definer set search_path = public as $$
  select * from public_area_stw((select public_org()), p_ids);
$$;
grant execute on function public_area_stw(uuid, uuid[]) to anon, authenticated;

-- public_districts (p_org) — river-scoped: districts of parishes containing this river's data.
-- The no-arg version (all national reference parishes) is intentionally left untouched.
create or replace function public_districts(p_org uuid)
returns table (district text, parishes int, population int)
language sql stable security definer set search_path = public as $$
  with rel as (
    select p.district, p.census_2021_population
    from parishes p
    where p.boundary is not null
      and (exists (select 1 from sewage_assets a where a.parish_id = p.id and a.organisation_id = p_org)
        or exists (select 1 from test_sites s where s.parish_id = p.id and s.organisation_id = p_org))
  )
  select district, count(*)::int, sum(census_2021_population)::int
  from rel group by district order by district;
$$;
grant execute on function public_districts(uuid) to anon, authenticated;

-- public_parishes (p_org) — river-scoped: parishes containing this river's assets or test sites.
-- The no-arg version (all national reference parishes) is intentionally left untouched.
create or replace function public_parishes(p_org uuid)
returns table (id uuid, name text, district text, population int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.district, p.census_2021_population
  from parishes p
  where p.boundary is not null
    and (exists (select 1 from sewage_assets a where a.parish_id = p.id and a.organisation_id = p_org)
      or exists (select 1 from test_sites s where s.parish_id = p.id and s.organisation_id = p_org))
  order by p.name;
$$;
grant execute on function public_parishes(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
