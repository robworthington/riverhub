-- River Hub — assign sewage_assets to a parish by location (for the assets parish filter).
-- The catchment importer set water bodies but not parishes. Point-in-polygon against the loaded
-- Dart parish boundaries, with a nearest-parish fallback (<=2 km) for points just outside a polygon
-- (e.g. estuary/foreshore outlets). Idempotent: only fills assets whose parish_id is null.

update sewage_assets a set parish_id = p.id
from parishes p
where a.parish_id is null
  and a.latitude is not null and a.longitude is not null
  and p.boundary is not null
  and ST_Contains(p.boundary, ST_SetSRID(ST_Point(a.longitude, a.latitude), 4326));

update sewage_assets a set parish_id = nn.pid
from (
  select a2.id sid,
    (select p.id from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326) limit 1) pid,
    (select ST_Distance(p.boundary::geography, ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326)::geography)
       from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(a2.longitude, a2.latitude), 4326) limit 1) dist
  from sewage_assets a2
  where a2.parish_id is null and a2.latitude is not null and a2.longitude is not null
) nn
where a.id = nn.sid and nn.dist < 2000;
