-- River Hub — river-centreline network (shared reference geometry) for the granular pollution
-- "river stretches" layer. Loaded from OSM (scripts/import_rivers.py), clipped to the Dart parishes.

create table river_segments (
  id        uuid primary key default gen_random_uuid(),
  osm_id    bigint,
  name      text,
  waterway  text,
  geom      geometry(LineString, 4326) not null
);
create index on river_segments using gist (geom);

alter table river_segments enable row level security;
create policy river_read on river_segments for select using (auth.role() = 'authenticated');
-- no user write policy: loaded via importer / service role only.
