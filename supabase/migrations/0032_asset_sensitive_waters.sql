-- River Hub — sensitive-water flags on assets (DRY-SPILL-METHOD.md §6, dossier receptor dimension).
-- The EA EDM FeatureServer tags each outlet with a Bathing Water / Shellfish Water name where the
-- overflow carries that EDM requirement; import_catchment now stores them. Nullable text (the
-- designation name) — null = no such requirement. Populated on the next asset import; harmless if
-- not yet run. Full downstream-proximity modelling (geometry layers) remains a backlog data layer.

alter table sewage_assets add column if not exists bathing_water text;
alter table sewage_assets add column if not exists shellfish_water text;
