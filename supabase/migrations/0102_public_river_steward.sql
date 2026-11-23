-- River Hub — expose organisations.steward (0101) through public_river(), so the public header, footer
-- and share cards credit a river's local group only when one has claimed it, instead of guessing from
-- whether the organisation's name starts with "River".
--
-- Adding a column changes the function's return type, so it is dropped and recreated (same arguments,
-- same body plus steward last; nothing else depends on it). Grants are restored explicitly.

drop function if exists public_river(text);

create function public_river(p_slug text)
returns table (
  id uuid, slug text, org_name text, region text, live boolean, river_name text, portal_name text,
  company_name text, logo_url text, marketing_url text, donate_url text, map_centre_lat double precision,
  map_centre_lng double precision, map_zoom integer, capacity_response boolean, steward text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.river_slug as slug, o.name as org_name, o.region, o.live, o.river_name, o.portal_name,
         o.company_name, o.logo_url, o.marketing_url, o.donate_url, o.map_centre_lat, o.map_centre_lng, o.map_zoom,
         o.capacity_response, o.steward
  from organisations o
  where o.river_slug = p_slug and o.live;
$$;

grant execute on function public_river(text) to anon, authenticated, service_role;
