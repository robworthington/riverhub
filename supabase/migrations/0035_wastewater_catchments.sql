-- River Hub — defensible asset→system grouping (see ASSET-GROUPING-METHOD.md).
-- Replaces name-prefix grouping with a spatial assignment to the water company's own wastewater
-- catchment areas (Hoffmann et al., GB wastewater catchment areas; EIR-sourced, UWWTD-matched).
-- Each asset is grouped under the TERMINAL treatment works whose catchment polygon it falls in —
-- e.g. Dartington's overflows resolve to Totnes STW. Loaded by scripts/import_sewage_systems.py.

-- National reference layer (per-instance slice: the instance's water company), org-scoped like
-- water_bodies / parishes.
create table wastewater_catchments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  identifier      text not null,        -- WWCA catchment identifier
  company         text,
  name            text,                 -- provider catchment name
  uww_code        text,                 -- UWWTD treatment-works id (where matched)
  uww_name        text,                 -- UWWTD treatment-works name (the terminal works)
  geom            geometry(MultiPolygon, 4326),
  source          text default 'wwca',
  created_at      timestamptz not null default now(),
  unique (organisation_id, identifier)
);
create index on wastewater_catchments (organisation_id);
create index on wastewater_catchments using gist (geom);

alter table wastewater_catchments enable row level security;
create policy wwc_read on wastewater_catchments for select using (organisation_id = current_org());
create policy wwc_admin_write on wastewater_catchments for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- sewage_systems: identity becomes the terminal works (uww_code where known); keep name as label.
alter table sewage_systems add column if not exists uww_code text;
alter table sewage_systems add column if not exists catchment_identifier text;
alter table sewage_systems add column if not exists source text;

-- sewage_assets: record how confidently the system was assigned, and let an admin pin an override
-- (when system_override = true, the importer will not repoint that asset).
alter table sewage_assets add column if not exists system_match_confidence text;  -- high | medium | low
alter table sewage_assets add column if not exists system_override boolean not null default false;
