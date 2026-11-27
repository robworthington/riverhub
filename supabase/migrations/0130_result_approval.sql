-- 0130: result approval and group credit (ROLES-AND-GROUPS-SPEC.md, build step 4).
--
-- * test_results gains status (pending | approved | rejected), reviewed_by, reviewed_at, review_note.
--   Every existing row is approved.
-- * A member without the sampling task entering a result in a group that requires approval
--   (groups.results_need_approval) gets a pending result; everyone else's are approved. Only someone
--   with sampling changes a status (approve, reject, reopen). Editing a rejected result sends it back to
--   pending. Import scripts and API-key imports (no signed-in user) stay approved.
-- * Who edits what: sampling edits and deletes any of the group's results; data entry alone only its
--   own, and in a group that requires approval only while not yet approved. (In step 2 data entry could
--   delete any of the group's results.)
-- * Members see approved results from every group on the river plus all of their own group's.
-- * Every public RPC and every members' map/analysis function counts approved results only.
-- * public_area_sites names the group that samples each site; public_river_groups lists the groups
--   working on a river (for the public river pages).

alter table public.test_results
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or length(review_note) <= 1000);
create index test_results_pending on public.test_results (group_id) where status = 'pending';

create function public.group_needs_approval(g uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select results_need_approval from groups where id = g), false)
$$;

-- Status on insert and on change (runs after fill_group_id, which sorts first).
create function public.test_results_review() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare sampler boolean;
begin
  if auth.uid() is null then
    -- import scripts and API-key imports (service role): trusted, approved unless they say otherwise
    return new;
  end if;
  sampler := has_task('sampling');

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.status := case when sampler or not group_needs_approval(new.group_id) then 'approved' else 'pending' end;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not sampler and not (old.status = 'rejected' and new.status = 'pending') then
      raise exception 'needs_sampling' using hint = 'Only someone with the sampling task can approve or reject results.';
    end if;
    if sampler then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  elsif not sampler and old.status = 'rejected' then
    new.status := 'pending';  -- a corrected result goes back for review
  end if;
  if not sampler then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;
  return new;
end $$;

create trigger test_results_review before insert or update on public.test_results
  for each row execute function public.test_results_review();

drop policy if exists result_read on public.test_results;
create policy result_read on public.test_results for select
  using (organisation_id = (select current_org()) and (status = 'approved' or group_id = (select current_group())));

drop policy if exists result_write on public.test_results;
create policy result_write on public.test_results for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (
    (select has_task('sampling'))
    or ((select has_task('data_entry')) and created_by = auth.uid()
        and (status <> 'approved' or not (select group_needs_approval(current_group()))))))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (
    (select has_task('sampling'))
    or ((select has_task('data_entry')) and created_by = auth.uid()
        and (status <> 'approved' or not (select group_needs_approval(current_group()))))));

-- ---------------------------------------------------------------- approved results only

create or replace function public.area_pollution(p_level text, p_type uuid, p_from date default null::date, p_to date default null::date)
 returns table(area_key text, name text, n integer, vmin numeric, vmax numeric, vmean numeric, vmedian numeric, tidal_majority boolean, geojson text)
 language sql stable
as $function$
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
    where r.result is not null and r.status = 'approved'
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

create or replace function public.parish_heat(p_type uuid, p_from date, p_to date)
 returns table(parish_id uuid, parish_name text, mean_result numeric, n bigint, geojson text)
 language sql stable
as $function$
  select p.id,
         p.name,
         round(avg(r.result)::numeric, 1) as mean_result,
         count(r.id) as n,
         st_asgeojson(p.boundary) as geojson
  from parishes p
  join test_sites s on s.parish_id = p.id
  join test_results r on r.site_id = s.id
  where p.boundary is not null
    and r.result is not null and r.status = 'approved'
    and (p_type is null or r.test_type_id = p_type)
    and (p_from is null or r.date_collected >= p_from)
    and (p_to   is null or r.date_collected <= p_to)
  group by p.id, p.name, p.boundary;
$function$;

create or replace function public.public_area_pollution(p_level text, p_type uuid default null::uuid)
 returns table(area_key text, name text, n integer, vmin numeric, vmax numeric, vmean numeric, vmedian numeric, tidal_majority boolean, geojson text)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with res as (
    select pp.id as pid, pp.district, s.tidal, r.result
    from test_results r
    join test_sites s on s.id = r.site_id
    join parishes pp on pp.id = s.parish_id
    where s.organisation_id = (select public_org()) and r.result is not null and r.status = 'approved'
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
$function$;

-- now also names the group sampling each site (changed return type, so dropped and recreated)
drop function if exists public.public_area_sites(uuid, uuid[]);
create function public.public_area_sites(p_org uuid, p_ids uuid[])
 returns table(id uuid, name text, type text, tidal boolean, lat double precision, lng double precision, samples integer, klass text, group_name text, group_slug text)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with res as (
    select s.id, s.name, s.type::text typ, s.tidal, s.latitude, s.longitude, g.name gname, g.slug gslug,
      array_agg(r.result) filter (where tt.test_name = 'E. coli (culture)' and r.result is not null) ec,
      array_agg(r.result) filter (where tt.test_name = 'Intestinal enterococci (culture)' and r.result is not null) ie,
      count(r.*)::int n
    from test_sites s
    left join groups g on g.id = s.group_id
    left join test_results r on r.site_id = s.id and r.status = 'approved'
    left join test_types tt on tt.id = r.test_type_id
    where s.organisation_id = p_org and s.parish_id = any(p_ids)
    group by s.id, s.name, s.type, s.tidal, s.latitude, s.longitude, g.name, g.slug
  )
  select id, name, typ, tidal, latitude, longitude, n,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie')), gname, gslug
  from res order by name;
$function$;
grant execute on function public.public_area_sites(uuid, uuid[]) to anon, authenticated;

create or replace function public.public_river_pollution(p_type uuid default null::uuid, p_max_dist_m integer default 500)
 returns table(segment_id uuid, name text, geojson text, n integer, vmedian numeric, tidal boolean, nearest_site text, dist_m integer)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with sitestats as (
    select s.id, s.name, s.tidal, ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n, percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s join test_results r on r.site_id = s.id
    where s.organisation_id = (select public_org()) and r.result is not null and r.status = 'approved'
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
$function$;

create or replace function public.public_site_pollution(p_type uuid default null::uuid)
 returns table(site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n integer, vmedian numeric)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  select s.id, s.name, s.latitude, s.longitude, s.tidal, count(r.result)::int,
         percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s join test_results r on r.site_id = s.id
  where s.organisation_id = (select public_org()) and r.result is not null and r.status = 'approved'
    and s.latitude is not null and s.longitude is not null
    and ((p_type is not null and r.test_type_id = p_type)
      or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$function$;

create or replace function public.public_site_results(p_site uuid)
 returns table(date_collected date, test_name text, primary_unit text, result numeric, result_qualifier text, condition text, observed_weather text, collected_by text)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  select r.date_collected, tt.test_name, tt.primary_unit, r.result, r.result_qualifier,
         r.condition::text, r.observed_weather, r.organisation_collecting
  from test_results r
  join test_sites s on s.id = r.site_id
  join test_types tt on tt.id = r.test_type_id
  where s.organisation_id = (select public_org()) and r.site_id = p_site and r.status = 'approved'
  order by r.date_collected desc;
$function$;

create or replace function public.public_sites()
 returns table(id uuid, name text, type text, tidal boolean, latitude double precision, longitude double precision, parish text, samples integer)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  select s.id, s.name, s.type::text, s.tidal, s.latitude, s.longitude, p.name,
         (select count(*) from test_results r where r.site_id = s.id and r.status = 'approved')::int
  from test_sites s left join parishes p on p.id = s.parish_id
  where s.organisation_id = (select public_org())
  order by s.name;
$function$;

create or replace function public.river_pollution(p_type uuid, p_from date default null::date, p_to date default null::date, p_max_dist_m integer default 500)
 returns table(segment_id uuid, name text, geojson text, n integer, vmedian numeric, tidal boolean, nearest_site text, dist_m integer)
 language sql stable
as $function$
  with sitestats as (
    select s.id, s.name, s.tidal, ST_SetSRID(ST_Point(s.longitude, s.latitude), 4326) as g,
           count(r.result)::int as n, percentile_cont(0.5) within group (order by r.result)::numeric as med
    from test_sites s
    join test_results r on r.site_id = s.id
    where r.result is not null and r.status = 'approved' and s.latitude is not null and s.longitude is not null
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
$function$;

create or replace function public.site_pollution(p_type uuid, p_from date default null::date, p_to date default null::date)
 returns table(site_id uuid, name text, lat double precision, lng double precision, tidal boolean, n integer, vmedian numeric)
 language sql stable
as $function$
  select s.id, s.name, s.latitude, s.longitude, s.tidal,
         count(r.result)::int, percentile_cont(0.5) within group (order by r.result)::numeric
  from test_sites s
  join test_results r on r.site_id = s.id
  where r.result is not null and r.status = 'approved' and s.latitude is not null and s.longitude is not null
    and ((p_type is not null and r.test_type_id = p_type)
      or (p_type is null and r.test_type_id in (select id from test_types where test_name ilike '%coli%')))
    and (p_from is null or r.date_collected >= p_from)
    and (p_to   is null or r.date_collected <= p_to)
  group by s.id, s.name, s.latitude, s.longitude, s.tidal;
$function$;

-- the dashboard also counts results waiting for review in my group (for people with sampling)
create or replace function public.member_dashboard()
 returns jsonb
 language sql stable
as $function$
  with open_req as (
    select coalesce(extended_to, due_on) as due
    from info_requests
    where status in ('sent', 'acknowledged', 'extended', 'internal_review')
  ),
  last_result as (
    select s.id, max(r.date_collected) as last_on
    from test_sites s left join test_results r on r.site_id = s.id and r.status = 'approved'
    group by s.id
  )
  select jsonb_build_object(
    'requests_overdue',  (select count(*) from open_req where due < current_date),
    'requests_due_soon', (select count(*) from open_req where due >= current_date and due <= current_date + 7),
    'requests_open',     (select count(*) from open_req),
    'requests_drafts',   (select count(*) from info_requests where status = 'draft'),
    'requests_unloaded', (select count(*) from info_requests where status in ('answered', 'partial') and not data_loaded),
    'photos_pending',    (select count(*) from river_photos where status = 'pending'),
    'winep_to_link',     (select count(*) from measures_awaiting_linking()),
    'assets_no_system',  (select count(*) from sewage_assets where sewage_system_id is null),
    'sites_total',       (select count(*) from test_sites),
    'sites_stale',       (select count(*) from last_result where last_on is not null and last_on < current_date - 56),
    'results_month',     (select count(*) from test_results where date_collected >= date_trunc('month', current_date) and status = 'approved'),
    'results_to_review', (select count(*) from test_results where status = 'pending' and group_id = current_group())
  )
$function$;

-- ---------------------------------------------------------------- groups on public river pages

create function public.public_river_groups(p_org uuid)
returns table (name text, slug text, website_url text, logo_url text)
language sql stable security definer set search_path = public, extensions as $$
  select g.name, g.slug, g.website_url, g.logo_url
  from group_rivers gr join groups g on g.id = gr.group_id and g.status = 'active'
  where gr.organisation_id = p_org
  order by gr.since, g.name
$$;
grant execute on function public.public_river_groups(uuid) to anon, authenticated;
