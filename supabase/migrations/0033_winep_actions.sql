-- River Hub — WINEP actions (Water Industry National Environment Programme).
-- See WINEP-DATA-RESEARCH.md. Each row is one EA-issued, legally-binding action a water company must
-- complete in a price-review cycle (PR24/AMP8 2025–30; PR19/AMP7 2020–25). Sourced from the national,
-- geocoded PR24 FeatureServer (Rivers Trust mirror of EA data) and the PR19 national XLSX — pulled
-- per-catchment by water company + water-body, mirroring the EDM importer (import_winep.py).
--
-- Linkage (see the source spike): the EA wbID joins our water_bodies; a normalised works-name links
-- the action to a works (sewage_system) and, where unambiguous, an outlet (sewage_asset). WINEP
-- actions are works/water-body level, so asset_id and sewage_system_id are both nullable — a
-- catchment-level action (e.g. a WFD investigation) links only to a water body.
--
-- Permit columns are stored as text: the feed carries 'n/a'/null on most storm-overflow improvement
-- actions and a numeric string (e.g. '40') on a minority, so it only *partially* fills the DWF/FFT
-- permit gap. Faithful text preserves that distinction for the UI.

create table winep_actions (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id),
  cycle               text not null,            -- 'PR24' | 'PR19'
  action_id           text not null,            -- EA actionID (e.g. 08SW102967)
  action_component    text not null default '', -- actionComponent (e.g. 'i'); '' when absent (PR19)
  water_company       text,

  -- regulatory driver (decoded from the EA DriverCodes lookup at import time)
  driver_code         text,                     -- driverCodePrimary, e.g. U_IMP1
  driver_label        text,                     -- Description_ (trimmed)
  driver_obligation   text,                     -- Obligation theme, e.g. 'Environment Act'
  driver_code_secondary text,
  driver_code_tertiary  text,

  action_name         text,
  action_description  text,
  tier1_outcome       text,
  options_outcome     text,                     -- optionsAssessmentOutcome (e.g. 'proceed')
  aim                 text,                     -- actionCategorisationAim
  spatial_scale       text,                     -- spatialScaleActionDelivery

  -- water body: EA string id (GB…) + our resolved internal FK (nullable until matched)
  ea_water_body_id    text,                     -- wbID
  wb_type             text,                     -- River / TraC / Groundwater …
  wb_name             text,                     -- boundaryName
  water_body_id       uuid references water_bodies(id),

  -- asset / works linkage (nullable: catchment-level actions link only to a water body)
  asset_id            uuid references sewage_assets(id) on delete set null,
  sewage_system_id    uuid references sewage_systems(id) on delete set null,

  completion_date     date,                     -- the legal deadline (completionDate, epoch ms → date)

  -- receptor links (named designation, or null)
  bathing_water       text,
  shellfish_water     text,
  sssi                text,
  sac_spa_ramsar      text,
  mcz                 text,

  -- permit changes (current → proposed); stored as text (values include 'n/a')
  current_permit_dwf  text,
  proposed_permit_dwf text,
  current_bod         text,
  proposed_bod        text,
  current_nh3         text,
  proposed_nh3        text,
  current_p           text,
  proposed_p          text,

  latitude            double precision,
  longitude           double precision,
  location            geography(Point, 4326)
                        generated always as (
                          case
                            when latitude is not null and longitude is not null
                            then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
                            else null
                          end
                        ) stored,

  source              text,                     -- e.g. 'winep_pr24_fs' / 'winep_pr19_xlsx'
  created_at          timestamptz not null default now(),

  unique (organisation_id, cycle, action_id, action_component)
);

create index on winep_actions (organisation_id);
create index on winep_actions (asset_id);
create index on winep_actions (sewage_system_id);
create index on winep_actions (water_body_id);
create index on winep_actions using gist (location);

-- RLS: org members read; only admins write (the importer runs as postgres/service role, bypassing
-- RLS). Public exposure is via SECURITY DEFINER public_winep_* RPCs over the public_org() slice
-- (next migration), so no anon policy on the table itself — mirrors edm_snapshots / sewage_assets.
alter table winep_actions enable row level security;

create policy winep_read on winep_actions for select using (organisation_id = current_org());
create policy winep_admin_write on winep_actions for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());
