-- The SODRP proximity checks cast protected_areas.geom to geography for metre-based ST_DWithin/
-- ST_Distance (5 km / 1 km thresholds). The existing GiST index is on geom (geometry) and cannot
-- serve a geography predicate, so the join full-scans protected_areas per asset. Fine for a single
-- asset (sodrp_for_asset) but too slow across the whole catchment (public_spills_reduction) under the
-- anon role's statement timeout — the page came back empty. A geography expression index makes the
-- proximity join index-assisted.
create index if not exists protected_areas_geog_idx on protected_areas using gist ((geom::geography));
