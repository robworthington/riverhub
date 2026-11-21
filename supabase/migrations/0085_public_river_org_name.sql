-- Phase 1 workstream C — extend public_river with the stewarding org's display name, so the public
-- header/footer branding ("FRIENDS OF THE DART", "published by …") can be resolved at request time
-- from the river rather than the build-time INSTANCE constant. Additive: adds one output column.
-- (public_river was introduced in 0081; changing its return type needs a drop first.)
drop function if exists public_river(text);
create or replace function public_river(p_slug text)
returns table (
  id uuid, slug text, org_name text, region text, live boolean, river_name text, portal_name text,
  company_name text, logo_url text, marketing_url text, donate_url text,
  map_centre_lat double precision, map_centre_lng double precision, map_zoom int
)
language sql stable security definer set search_path = public as $$
  select o.id, o.river_slug as slug, o.name as org_name, o.region, o.live, o.river_name, o.portal_name,
         o.company_name, o.logo_url, o.marketing_url, o.donate_url, o.map_centre_lat, o.map_centre_lng, o.map_zoom
  from organisations o
  where o.river_slug = p_slug and o.live;
$$;
grant execute on function public_river(text) to anon, authenticated;

notify pgrst, 'reload schema';
