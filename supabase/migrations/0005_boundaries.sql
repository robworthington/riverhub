-- River Hub — M3b: parish boundary polygons for the choropleth heat map

alter table parishes add column if not exists boundary geometry(MultiPolygon, 4326);
create index if not exists parishes_boundary_gix on parishes using gist (boundary);
