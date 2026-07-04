-- River Hub — expose protected_areas.attrs through the RPCs so designation-specific detail
-- (e.g. a bathing water's latest compliance classification) can be shown on the map and area pages.
-- Return-type change → drop + recreate.
drop function if exists public_protected_areas(text);
create or replace function public_protected_areas(p_designation text default null)
returns table (id uuid, designation text, source_id text, name text, wfd_wb_id text,
               sodrp_high_priority boolean, attrs jsonb, geojson text)
language sql stable security definer set search_path = public as $$
  select id, designation, source_id, name, wfd_wb_id, sodrp_high_priority, attrs, ST_AsGeoJSON(geom)
  from protected_areas
  where organisation_id = public_org()
    and (p_designation is null or designation = p_designation)
  order by designation, name;
$$;
grant execute on function public_protected_areas(text) to anon, authenticated;

drop function if exists protected_areas_for_parishes(uuid[], text);
create or replace function protected_areas_for_parishes(p_ids uuid[], p_designation text default null)
returns table (id uuid, designation text, name text, source_id text, sodrp_high_priority boolean, attrs jsonb)
language sql stable security definer set search_path = public as $$
  select distinct pa.id, pa.designation, pa.name, pa.source_id, pa.sodrp_high_priority, pa.attrs
  from protected_areas pa
  join parishes p on p.id = any(p_ids) and p.boundary is not null
    and ST_Intersects(pa.geom, p.boundary)
  where pa.organisation_id = public_org()
    and (p_designation is null or pa.designation = p_designation)
  order by pa.designation, pa.name;
$$;
grant execute on function protected_areas_for_parishes(uuid[], text) to anon, authenticated;
