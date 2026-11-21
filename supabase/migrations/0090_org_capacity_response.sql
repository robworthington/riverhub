-- Phase 1 follow-up — make the "the water company has given an initial capacity response" flag
-- per-river instead of the build-time NEXT_PUBLIC_CAPACITY_RESPONSE env, which is a single value for
-- the whole national deployment (so without this, turning it on for the Dart would also turn it on
-- for every other river's capacity page). Moves it onto the org row like the rest of the branding.
alter table organisations add column if not exists capacity_response boolean not null default false;

-- Backfill the Dart (SWW EIR26291 gave its flow-to-full-treatment / population figures).
update organisations set capacity_response = true where id = '00000000-0000-0000-0000-000000000001';

-- public_river gains the flag (return-type change needs a drop first).
drop function if exists public_river(text);
create or replace function public_river(p_slug text)
returns table (
  id uuid, slug text, org_name text, region text, live boolean, river_name text, portal_name text,
  company_name text, logo_url text, marketing_url text, donate_url text,
  map_centre_lat double precision, map_centre_lng double precision, map_zoom int,
  capacity_response boolean
)
language sql stable security definer set search_path = public as $$
  select o.id, o.river_slug as slug, o.name as org_name, o.region, o.live, o.river_name, o.portal_name,
         o.company_name, o.logo_url, o.marketing_url, o.donate_url, o.map_centre_lat, o.map_centre_lng, o.map_zoom,
         o.capacity_response
  from organisations o
  where o.river_slug = p_slug and o.live;
$$;
grant execute on function public_river(text) to anon, authenticated;

notify pgrst, 'reload schema';
