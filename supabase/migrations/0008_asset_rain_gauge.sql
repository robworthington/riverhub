-- River Hub — per-asset rain-gauge mapping
-- Each sewage asset is matched to its nearest representative EA rain gauge so
-- dry-spill classification uses locally-relevant rainfall (closer to the EA's
-- "upstream catchment" rainfall) instead of one gauge for the whole catchment.

alter table rainfall_stations
  add constraint rainfall_stations_org_ea_key unique (organisation_id, ea_station_id);

alter table sewage_assets
  add column if not exists rainfall_station_id uuid references rainfall_stations(id);

create index if not exists sewage_assets_rain_gauge_idx on sewage_assets (rainfall_station_id);
