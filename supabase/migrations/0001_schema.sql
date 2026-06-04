-- River Hub — M1 schema
-- Single-organisation foundation; every tenant row carries organisation_id.

create extension if not exists postgis;

-- ---------- Enums ----------
create type app_role         as enum ('admin', 'volunteer');
create type site_type        as enum ('bathing_water', 'community_designated');
create type test_category    as enum ('biological', 'chemical', 'physical');
create type sample_condition as enum ('wet', 'dry');

-- ---------- Tenancy ----------
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references organisations(id),
  full_name       text,
  role            app_role not null default 'volunteer',
  created_at      timestamptz not null default now()
);

-- ---------- Reference data ----------
create table water_bodies (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id),
  code             text not null,
  label            text not null,
  ea_water_body_id text,
  created_at       timestamptz not null default now(),
  unique (organisation_id, code)
);

-- Devon & Cornwall civil parishes (shared reference data, no org tag).
-- Superseded/linked by admin boundaries (4.4) in M3 — ons_code filled then.
create table parishes (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  district  text not null,
  county    text not null,
  ons_code  text,
  unique (name, district)
);

create table test_types (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references organisations(id),
  test_name             text not null,
  common_name           text,
  test_code             text,
  category              test_category,
  subcategory           text,
  measurement_type      text,
  primary_unit          text,
  detection_limit       numeric,
  measurement_range_min numeric,
  measurement_range_max numeric,
  regulatory_thresholds  jsonb,
  threshold_source      text,
  health_risk_levels    text,
  created_at            timestamptz not null default now()
);

-- ---------- Water-quality core ----------
create table test_sites (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references organisations(id),
  name                   text not null,
  site_code              text,
  type                   site_type,
  rationale              text,
  description            text,
  parish_id              uuid references parishes(id),
  latitude               double precision,
  longitude              double precision,
  -- generated geography for spatial queries / maps (M3); read lat/long directly.
  location               geography(Point, 4326)
                           generated always as (
                             case
                               when latitude is not null and longitude is not null
                               then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
                               else null
                             end
                           ) stored,
  what_three_words       text,
  tidal                  boolean not null default false,
  water_body_id          uuid references water_bodies(id),
  public_or_private      boolean,
  land_ownership         text,
  sampling_strategy      text,
  land_access_permission boolean,
  access_point           text,
  notes                  text,
  created_by             uuid references profiles(id),
  created_at             timestamptz not null default now()
);

create table site_photos (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references test_sites(id) on delete cascade,
  storage_path text not null,
  caption      text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table test_results (
  id                      uuid primary key default gen_random_uuid(),
  organisation_id         uuid not null references organisations(id),
  site_id                 uuid not null references test_sites(id),
  test_type_id            uuid not null references test_types(id),
  date_collected          date not null,
  time_collected          time,
  person_collecting       text,
  organisation_collecting text,
  result                  numeric,
  chain_of_custody_path   text,
  rainfall                numeric,
  condition               sample_condition,
  other_observations      text,
  created_by              uuid references profiles(id),
  created_at              timestamptz not null default now()
);

create index on test_results (site_id, date_collected);
create index on test_results (organisation_id);
create index on test_sites using gist (location);
create index on test_sites (organisation_id);
create index on parishes (county, district, name);
