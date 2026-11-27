-- 0134: the EA sampling-point list shows only points inside the river's outline (27 Nov 2026).
--
-- EA samples are loaded for a rectangle around each river, so the "Every sampling point" list
-- (public_ea_wq_sites, also used by the members' Sites page) included points on neighbouring rivers:
-- on the Dart, 81 of 126. The River health overview, the map layer and the works pages already keep
-- only points within about 300 m (0.003 degrees) of the outline; this list now uses the same rule.
-- A river with no outline loaded still shows every point.
--
-- public_ea_wq_site_samples (a single point's page) is unchanged, so links from works pages to an
-- upstream point just outside the outline keep working.

create or replace function public.public_ea_wq_sites(p_org uuid)
returns table (notation text, site_label text, latitude double precision, longitude double precision,
               wb_name text, determinands text[], n_samples bigint, latest_sample timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
  pts as (
    select notation, max(site_label) site_label, max(latitude) lat, max(longitude) lng, max(wb_name) wb_name,
           array_agg(distinct determinand order by determinand) dets, count(*) n, max(sampled_at) latest
    from ea_wq_samples where organisation_id = p_org
    group by notation
  )
  select notation, site_label, lat, lng, wb_name, dets, n, latest
  from pts
  where not exists (select 1 from b)
     or exists (select 1 from b where ST_DWithin(b.geom, ST_SetSRID(ST_MakePoint(pts.lng, pts.lat), 4326), 0.003))
  order by site_label;
$$;
