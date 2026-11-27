-- 0132: groups choose to publish their water-quality testing (agreed with Rob 27 Nov 2026).
--
-- * groups.publish_results: off by default. A group can only publish with result approval switched on
--   (constraint), so only reviewed results go public. Switching approval off unpublishes.
-- * What goes public: site name and location, dates, results, method, bathing-water class.
--   Never: who collected a sample, notes, chain-of-custody files, land ownership or access details.
--   Sites marked private, or needing land-access permission, show a location rounded to about 100 m.
-- * Volunteers' sites on the council-area pages (public_area_sites) now appear only for groups that
--   publish. Before this, every group's sites and classes showed there without anyone agreeing to it.
-- * New public functions for the River health section: public_volunteer_sites(river) and
--   public_volunteer_site(site). Published results are offered under CC BY 4.0, credited to the group.
-- * update_group gains p_publish_results (settings task).
--
-- The older single-river public_* functions (public_org(), used by the per-group instances) aren't
-- changed; on the national database public_org() is null and they return nothing.

alter table public.groups add column publish_results boolean not null default false;
alter table public.groups add constraint groups_publish_needs_approval
  check (not publish_results or results_need_approval);

-- Location shown publicly: exact for public land, about 100 m for private land or permission-only access.
create function public.public_site_point(lat double precision, lng double precision, is_public boolean, needs_permission boolean,
                                         out plat double precision, out plng double precision, out approximate boolean)
language sql immutable set search_path = public, extensions as $$
  select case when coalesce(is_public, true) = false or coalesce(needs_permission, false) then round(lat::numeric, 3)::float8 else lat end,
         case when coalesce(is_public, true) = false or coalesce(needs_permission, false) then round(lng::numeric, 3)::float8 else lng end,
         coalesce(is_public, true) = false or coalesce(needs_permission, false)
$$;

drop function if exists public.update_group(text, text, text, text, boolean);
create function public.update_group(p_name text, p_logo_url text, p_website_url text, p_donate_url text,
                                    p_results_need_approval boolean, p_publish_results boolean default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group(); v_approval boolean; v_publish boolean;
begin
  if g is null then raise exception 'not_allowed'; end if;
  if (p_name is not null or p_logo_url is not null or p_website_url is not null or p_donate_url is not null)
     and not has_task('comms') then
    raise exception 'needs_comms';
  end if;
  if (p_results_need_approval is not null or p_publish_results is not null) and not has_task('settings') then
    raise exception 'needs_settings';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then raise exception 'name_required'; end if;
  select coalesce(p_results_need_approval, results_need_approval), coalesce(p_publish_results, publish_results)
    into v_approval, v_publish from groups where id = g;
  if v_publish and not v_approval then
    if p_publish_results then raise exception 'publish_needs_approval'; end if;
    v_publish := false;  -- switching approval off unpublishes
  end if;
  update groups set
    name = coalesce(nullif(trim(p_name), ''), name),
    logo_url = case when p_logo_url is null then logo_url else nullif(trim(p_logo_url), '') end,
    website_url = case when p_website_url is null then website_url else nullif(trim(p_website_url), '') end,
    donate_url = case when p_donate_url is null then donate_url else nullif(trim(p_donate_url), '') end,
    results_need_approval = v_approval,
    publish_results = v_publish
  where id = g;
end $$;
revoke execute on function public.update_group(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.update_group(text, text, text, text, boolean, boolean) to authenticated;

-- council-area pages: only publishing groups' sites
create or replace function public.public_area_sites(p_org uuid, p_ids uuid[])
 returns table(id uuid, name text, type text, tidal boolean, lat double precision, lng double precision, samples integer, klass text, group_name text, group_slug text)
 language sql stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with res as (
    select s.id, s.name, s.type::text typ, s.tidal, pt.plat, pt.plng, g.name gname, g.slug gslug,
      array_agg(r.result) filter (where tt.test_name = 'E. coli (culture)' and r.result is not null) ec,
      array_agg(r.result) filter (where tt.test_name = 'Intestinal enterococci (culture)' and r.result is not null) ie,
      count(r.*)::int n
    from test_sites s
    join groups g on g.id = s.group_id and g.publish_results and g.status = 'active'
    cross join lateral public_site_point(s.latitude, s.longitude, s.public_or_private, s.land_access_permission) pt
    left join test_results r on r.site_id = s.id and r.status = 'approved'
    left join test_types tt on tt.id = r.test_type_id
    where s.organisation_id = p_org and s.parish_id = any(p_ids)
    group by s.id, s.name, s.type, s.tidal, pt.plat, pt.plng, g.name, g.slug
  )
  select id, name, typ, tidal, plat, plng, n,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie')), gname, gslug
  from res order by name;
$function$;

-- River health: every published volunteer site on the river
create function public.public_volunteer_sites(p_org uuid)
returns table (id uuid, name text, lat double precision, lng double precision, approximate boolean, tidal boolean,
               group_name text, group_slug text, samples integer, first_sampled date, last_sampled date,
               klass text, methods text[])
language sql stable security definer set search_path = public, extensions as $$
  with res as (
    select s.id, s.name, pt.plat, pt.plng, pt.approximate, s.tidal, g.name gname, g.slug gslug,
      count(r.*)::int n, min(r.date_collected) d0, max(r.date_collected) d1,
      array_agg(r.result) filter (where tt.test_name = 'E. coli (culture)' and r.result is not null) ec,
      array_agg(r.result) filter (where tt.test_name = 'Intestinal enterococci (culture)' and r.result is not null) ie,
      array_remove(array_agg(distinct tt.test_name), null) meths
    from test_sites s
    join organisations o on o.id = s.organisation_id and o.live
    join groups g on g.id = s.group_id and g.publish_results and g.status = 'active'
    cross join lateral public_site_point(s.latitude, s.longitude, s.public_or_private, s.land_access_permission) pt
    left join test_results r on r.site_id = s.id and r.status = 'approved'
    left join test_types tt on tt.id = r.test_type_id
    where s.organisation_id = p_org
    group by s.id, s.name, pt.plat, pt.plng, pt.approximate, s.tidal, g.name, g.slug
  )
  select id, name, plat, plng, approximate, tidal, gname, gslug, n, d0, d1,
         bw_worst(bw_class(ec, tidal, 'ecoli'), bw_class(ie, tidal, 'ie')), meths
  from res
  where n > 0
  order by name
$$;

-- One published site and its approved results (no collector, notes or access details).
create function public.public_volunteer_site(p_site uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'tidal', s.tidal, 'type', s.type::text, 'description', s.description,
    'lat', pt.plat, 'lng', pt.plng, 'approximate', pt.approximate,
    'org_id', s.organisation_id, 'river_slug', o.river_slug,
    'group', jsonb_build_object('name', g.name, 'slug', g.slug, 'website_url', g.website_url),
    'klass', (select bw_worst(
                bw_class(array_agg(r.result) filter (where tt.test_name = 'E. coli (culture)' and r.result is not null), s.tidal, 'ecoli'),
                bw_class(array_agg(r.result) filter (where tt.test_name = 'Intestinal enterococci (culture)' and r.result is not null), s.tidal, 'ie'))
              from test_results r join test_types tt on tt.id = r.test_type_id
              where r.site_id = s.id and r.status = 'approved'),
    'results', coalesce((select jsonb_agg(jsonb_build_object(
                  'date', r.date_collected, 'test', tt.test_name, 'unit', tt.primary_unit, 'result', r.result,
                  'qualifier', r.result_qualifier, 'condition', r.condition::text, 'weather', r.observed_weather)
                  order by r.date_collected desc, tt.test_name)
                from test_results r join test_types tt on tt.id = r.test_type_id
                where r.site_id = s.id and r.status = 'approved'), '[]'::jsonb))
  from test_sites s
  join organisations o on o.id = s.organisation_id and o.live
  join groups g on g.id = s.group_id and g.publish_results and g.status = 'active'
  cross join lateral public_site_point(s.latitude, s.longitude, s.public_or_private, s.land_access_permission) pt
  where s.id = p_site
$$;

grant execute on function public.public_volunteer_sites(uuid) to anon, authenticated;
grant execute on function public.public_volunteer_site(uuid) to anon, authenticated;
