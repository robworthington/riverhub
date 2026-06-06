-- River Hub — M2: sewage assets, permits, and EDM spill snapshots

create type asset_type as enum (
  'pumping_station',
  'storm_tank',
  'sewage_treatment_works',
  'combined_sewer_overflow'
);

-- ---------- Sewage systems (4.1.1) ----------
create table sewage_systems (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  description     text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------- Assets (4.1.2) ----------
create table sewage_assets (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id),
  sewage_system_id    uuid references sewage_systems(id),
  asset_name          text not null,
  asset_unique_id     text,                 -- EDM outlet id (e.g. SBB00885)
  asset_type          asset_type,
  water_body_id       uuid references water_bodies(id),
  parish_id           uuid references parishes(id),
  storage_capacity    numeric,              -- m³
  processing_capacity numeric,              -- m³/day
  asset_owner         text,
  asset_address       text,
  postcode            text,
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
  edm_enabled         boolean not null default true,
  notes               text,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  unique (organisation_id, asset_unique_id)
);

create index on sewage_assets (organisation_id);
create index on sewage_assets using gist (location);

-- ---------- Permits (4.1.5) ----------
create table asset_permits (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references organisations(id),
  asset_id                  uuid not null references sewage_assets(id) on delete cascade,
  permit_number             text,
  permit_start_date         date,
  permit_revocation_date    date,
  required_processing_volume numeric,        -- m³/day
  required_storage_capacity  numeric,        -- m³
  created_at                timestamptz not null default now()
);

-- ---------- EDM snapshots (4.1.3) ----------
-- Daily snapshot per asset from the SWW ArcGIS feed (current-state only feed),
-- so spill events are reconstructed from status transitions across snapshots.
create table edm_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references organisations(id),
  asset_id              uuid not null references sewage_assets(id) on delete cascade,
  outlet_id             text not null,
  snapshot_date         date not null,
  status                integer,             -- 1 spilling, 0 not spilling, -1 offline
  status_start          timestamptz,
  latest_event_start    timestamptz,
  latest_event_end      timestamptz,
  receiving_water_course text,
  last_updated          timestamptz,
  longitude             double precision,
  latitude              double precision,
  fetched_at            timestamptz not null default now(),
  unique (asset_id, snapshot_date)
);

create index on edm_snapshots (asset_id, snapshot_date desc);
create index on edm_snapshots (organisation_id);

-- ---------- RLS ----------
alter table sewage_systems enable row level security;
alter table sewage_assets  enable row level security;
alter table asset_permits  enable row level security;
alter table edm_snapshots  enable row level security;

-- systems / assets / permits: any org member may read + write
create policy sys_read  on sewage_systems for select using (organisation_id = current_org());
create policy sys_write on sewage_systems for all
  using (organisation_id = current_org()) with check (organisation_id = current_org());

create policy asset_read  on sewage_assets for select using (organisation_id = current_org());
create policy asset_write on sewage_assets for all
  using (organisation_id = current_org()) with check (organisation_id = current_org());

create policy permit_read  on asset_permits for select using (organisation_id = current_org());
create policy permit_write on asset_permits for all
  using (organisation_id = current_org()) with check (organisation_id = current_org());

-- EDM snapshots: org members read; only admins write (the cron uses service role,
-- which bypasses RLS).
create policy edm_read on edm_snapshots for select using (organisation_id = current_org());
create policy edm_admin_write on edm_snapshots for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- Seed: one real Dart-catchment CSO for EDM testing ----------
insert into sewage_systems (id, organisation_id, name, description) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000001',
   'River Dart system', 'Assets discharging to the River Dart')
on conflict do nothing;

insert into sewage_assets
  (organisation_id, sewage_system_id, asset_name, asset_unique_id, asset_type,
   water_body_id, asset_owner)
select '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1',
       'River Dart CSO (SBB00885)', 'SBB00885', 'combined_sewer_overflow',
       wb.id, 'South West Water'
from water_bodies wb
where wb.organisation_id = '00000000-0000-0000-0000-000000000001' and wb.code = '00005'
on conflict (organisation_id, asset_unique_id) do nothing;
