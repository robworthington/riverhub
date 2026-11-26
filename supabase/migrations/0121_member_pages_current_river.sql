-- 0121: Member pages show the river the member is on, not the instance's default river.
--
-- These security-definer functions were written for the single-river instances and read the river
-- from public_org() (app_config's one river). On the national deploy that is always the same river, so
-- a member on the Medway saw the default river's EA sites (/sites, /map, council pages), EA heat map
-- and WINEP measures to link. They now use the member's current river, current_org() (the river they
-- have switched to; the same rule row-level security uses), and fall back to public_org() only when
-- nobody is signed in, so any anonymous caller behaves as before.
--
-- The two heat-map functions also listed every parish in England (4,158, plus 107 merged districts)
-- on every call, because parishes are shared across rivers. They now list only parishes that overlap
-- the river's catchment outline (catchment_boundaries); a river with no outline keeps the old list.
-- Tables read directly by member pages were already right: their row-level security uses current_org().

-- ---------- the river a function should use ----------
-- (inlined into each function as coalesce(current_org(), public_org()))

-- ---------- EA sites (/sites, /map) ----------
create or replace function public.public_ea_wq_sites()
returns table(notation text, site_label text, latitude double precision, longitude double precision, wb_name text,
              determinands text[], n_samples bigint, latest_sample timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select * from public_ea_wq_sites((select coalesce(current_org(), public_org())));
$function$;

-- ---------- EA sites and protected areas inside a council area (/councils/…) ----------
create or replace function public.ea_area_sites(p_ids uuid[])
returns table(notation text, site_label text, n_samples bigint, latest_sample timestamptz, phosphate_mean numeric)
language sql stable security definer set search_path to 'public' as $function$
  select e.notation, max(e.site_label), count(*), max(e.sampled_at),
         round(avg(e.result) filter (where e.determinand = 'Orthophosphate, reactive as P' and e.result is not null)::numeric, 3)
  from ea_wq_samples e
  join parishes p on p.id = any(p_ids) and p.boundary is not null
    and ST_Contains(p.boundary, e.location::geometry)
  where e.organisation_id = coalesce(current_org(), public_org())
  group by e.notation
  order by count(*) desc;
$function$;

create or replace function public.protected_areas_for_parishes(p_ids uuid[], p_designation text default null)
returns table(id uuid, designation text, name text, source_id text, sodrp_high_priority boolean, attrs jsonb)
language sql stable security definer set search_path to 'public' as $function$
  select distinct pa.id, pa.designation, pa.name, pa.source_id, pa.sodrp_high_priority, pa.attrs
  from protected_areas pa
  join parishes p on p.id = any(p_ids) and p.boundary is not null
    and ST_Intersects(pa.geom, p.boundary)
  where pa.organisation_id = coalesce(current_org(), public_org())
    and (p_designation is null or pa.designation = p_designation)
  order by pa.designation, pa.name;
$function$;

-- ---------- EA heat map (/heatmap) ----------
create or replace function public.ea_site_pollution(p_determinand text)
returns table(site_id text, name text, lat double precision, lng double precision, tidal boolean, n integer, vmedian numeric)
language sql stable security definer set search_path to 'public' as $function$
  select notation, max(coalesce(site_label, notation)), max(latitude), max(longitude), false,
         count(*)::int, percentile_cont(0.5) within group (order by result)::numeric
  from ea_wq_samples
  where organisation_id = coalesce(current_org(), public_org()) and determinand = p_determinand and result is not null
    and latitude is not null and longitude is not null
  group by notation;
$function$;

create or replace function public.ea_area_pollution(p_level text, p_determinand text)
returns table(area_key text, name text, n integer, vmin numeric, vmax numeric, vmean numeric, vmedian numeric,
              tidal_majority boolean, geojson text)
language sql stable security definer set search_path to 'public' as $function$
  with org as (select coalesce(current_org(), public_org()) as id),
  -- the river's parishes: those overlapping its outline (every parish if it has no outline yet)
  rp as (
    select p.* from parishes p
    where p.boundary is not null
      and (not exists (select 1 from catchment_boundaries b where b.organisation_id = (select id from org))
           or exists (select 1 from catchment_boundaries b where b.organisation_id = (select id from org)
                      and ST_Intersects(b.geom, p.boundary)))
  ),
  res as (
    select pp.id as pid, pp.district, e.result
    from ea_wq_samples e
    join rp pp on ST_Contains(pp.boundary, e.location::geometry)
    where e.organisation_id = (select id from org) and e.determinand = p_determinand and e.result is not null
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
  select p.id::text, p.name, coalesce(pa.n, 0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, false, ST_AsGeoJSON(p.boundary)
  from rp p left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish'
  union all
  select dg.district, dg.district, coalesce(da.n, 0), da.vmin, da.vmax, da.vmean, da.vmedian, false, dg.geojson
  from (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson from rp group by district) dg
  left join dist_agg da on da.district = dg.district
  where p_level = 'district';
$function$;

-- ---------- volunteer heat map (/heatmap): results were already the member's river (row-level
-- security); now the areas are too ----------
create or replace function public.area_pollution(p_level text, p_type uuid, p_from date default null, p_to date default null)
returns table(area_key text, name text, n integer, vmin numeric, vmax numeric, vmean numeric, vmedian numeric,
              tidal_majority boolean, geojson text)
language sql stable as $function$
  with org as (select coalesce(current_org(), public_org()) as id),
  rp as (
    select p.* from parishes p
    where p.boundary is not null
      and (not exists (select 1 from catchment_boundaries b where b.organisation_id = (select id from org))
           or exists (select 1 from catchment_boundaries b where b.organisation_id = (select id from org)
                      and ST_Intersects(b.geom, p.boundary)))
  ),
  res as (
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
  -- a parish with results is always shown, even if it falls outside the outline
  select p.id::text, p.name, coalesce(pa.n,0), pa.vmin, pa.vmax, pa.vmean, pa.vmedian, coalesce(pa.tm,false),
         ST_AsGeoJSON(p.boundary)
  from parishes p left join parish_agg pa on pa.pid = p.id
  where p_level = 'parish' and p.boundary is not null
    and (p.id in (select id from rp) or pa.pid is not null)
  union all
  select dg.district, dg.district, coalesce(da.n,0), da.vmin, da.vmax, da.vmean, da.vmedian, coalesce(da.tm,false), dg.geojson
  from (select district, ST_AsGeoJSON(ST_Union(boundary)) geojson from parishes
        where boundary is not null
          and (id in (select id from rp) or id in (select pid from parish_agg))
        group by district) dg
  left join dist_agg da on da.district = dg.district
  where p_level = 'district';
$function$;

-- ---------- WINEP measures to link (/measures/unlinked) ----------
create or replace function public.measures_awaiting_linking()
returns table(id uuid, action_ref text, action_component text, action_name text, driver_code text, driver_label text,
              driver_obligation text, completion_date date, overdue boolean, suggested_asset_id uuid,
              suggested_asset_name text, match_kind text)
language sql stable security definer set search_path to 'public' as $function$
  with org as (select coalesce(current_org(), public_org()) as id),
  q as (
    select w.* from winep_actions w
    where w.organisation_id = (select id from org)
      and w.asset_id is null and w.sewage_system_id is null and w.water_body_id is null
      and not exists (select 1 from winep_asset_links l where l.winep_action_id = w.id)
  )
  select q.id, q.action_id, q.action_component, q.action_name, q.driver_code, q.driver_label,
         q.driver_obligation, q.completion_date,
         (q.completion_date is not null and q.completion_date < current_date) as overdue,
         sug.id, sug.asset_name, sug.match_kind
  from q
  left join lateral (
    select a.id, a.asset_name,
      case
        when q.action_name is not null
             and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1))
          then 'works-seg'
        when q.latitude is not null and a.latitude is not null and a.longitude is not null
             and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000)
          then 'proximity'
        else 'bathing-water'
      end as match_kind
    from sewage_assets a
    where a.organisation_id = (select id from org)
      and (
        (q.action_name is not null
          and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1)))
        or (q.latitude is not null and a.latitude is not null and a.longitude is not null
            and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                           ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000))
        or (a.bathing_water is not null and q.bathing_water is not null
            and upper(btrim(a.bathing_water)) = upper(btrim(q.bathing_water)))
        or (a.shellfish_water is not null and q.shellfish_water is not null
            and upper(btrim(a.shellfish_water)) = upper(btrim(q.shellfish_water)))
      )
    order by
      -- works-segment (exact) first, then nearest outlet, then a bathing-water peer
      (case
        when q.action_name is not null
             and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1)) then 0
        when q.latitude is not null and a.latitude is not null and a.longitude is not null
             and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000) then 1
        else 2 end),
      case when q.latitude is not null and a.latitude is not null and a.longitude is not null
           then ST_Distance(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography)
           else 1e9 end,
      a.asset_name
    limit 1
  ) sug on true
  order by q.completion_date nulls last, q.action_name;
$function$;
