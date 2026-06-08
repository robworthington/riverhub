-- River Hub — boundary GeoJSON for an administrative area (parish or district = set of parishes).
-- Returns the dissolved (unioned) boundary of the given parishes as a GeoJSON geometry string,
-- for the District/Parish council pages. SECURITY INVOKER → RLS applies to the caller.

create or replace function area_boundary_geojson(p_ids uuid[])
returns text
language sql
stable
as $$
  select ST_AsGeoJSON(ST_Union(boundary))
  from parishes
  where id = any(p_ids) and boundary is not null;
$$;

grant execute on function area_boundary_geojson(uuid[]) to authenticated;
