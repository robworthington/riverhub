-- 0135: which nation each river is in, and its Welsh name (WALES-ROLLOUT-PLAN.md §4, phase W0).
--
-- * organisations.nation: 'england' (every river today) or 'wales'. Pages use it to name the right
--   regulator (Environment Agency or Natural Resources Wales) and improvement programme (WINEP or NEP).
-- * organisations.river_name_cy: the river's Welsh name, shown beside the English one on Welsh pages.
-- * public_river and national_rivers also return nation and river_name_cy.
-- National pages work out their coverage ("England" today, "England and Wales" once a Welsh river is
-- live) from national_rivers' nation column, so no code change is needed when Wales goes live.
-- Nothing visible changes while every live river is in England.

alter table public.organisations
  add column nation text not null default 'england' check (nation in ('england', 'wales')),
  add column river_name_cy text;

drop function if exists public.public_river(text);
create function public.public_river(p_slug text)
returns table (id uuid, slug text, org_name text, region text, live boolean, river_name text, portal_name text,
               company_name text, logo_url text, marketing_url text, donate_url text, map_centre_lat double precision,
               map_centre_lng double precision, map_zoom integer, capacity_response boolean, steward text,
               nation text, river_name_cy text)
language sql stable security definer set search_path = public, extensions as $$
  select o.id, o.river_slug as slug, o.name as org_name, o.region, o.live, o.river_name, o.portal_name,
         o.company_name, o.logo_url, o.marketing_url, o.donate_url, o.map_centre_lat, o.map_centre_lng, o.map_zoom,
         o.capacity_response, o.steward, o.nation, o.river_name_cy
  from organisations o
  where o.river_slug = p_slug and o.live;
$$;
grant execute on function public.public_river(text) to anon, authenticated;

drop function if exists public.national_rivers(text);
create function public.national_rivers(p_district text default null)
returns table (slug text, river_name text, region text, org_name text, overflows integer, gaps integer, dry integer,
               hours_lfy integer, logo_url text, company_name text, district_slug text, district_name text,
               lat double precision, lng double precision, spilling_now integer, stopped_48h integer,
               nation text, river_name_cy text)
language sql stable security definer set search_path = public, extensions set statement_timeout = '30s' as $$
  select o.river_slug, o.river_name, o.region, o.name,
         coalesce(x.overflows, 0),
         coalesce(x.gaps, 0),
         coalesce(x.dry, 0),
         coalesce(x.hours_lfy, 0),
         o.logo_url,
         o.company_name,
         d.slug, d.name,
         coalesce(o.map_centre_lat, c.lat),
         coalesce(o.map_centre_lng, c.lng),
         coalesce(x.spilling_now, 0),
         coalesce(x.stopped_48h, 0),
         o.nation, o.river_name_cy
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  left join river_basin_districts d on d.id = o.rbd_id
  left join lateral (
    select avg(a.latitude)::double precision as lat, avg(a.longitude)::double precision as lng
    from sewage_assets a where a.organisation_id = o.id and a.latitude is not null
  ) c on true
  where o.live and o.river_slug is not null
    and (p_district is null or d.slug = p_district)
  order by coalesce(x.gaps, 0) desc, o.river_name;
$$;
grant execute on function public.national_rivers(text) to anon, authenticated;
