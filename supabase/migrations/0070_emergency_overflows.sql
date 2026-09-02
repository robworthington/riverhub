-- River Hub — Emergency Overflows (EOs / pumping-station emergency overflows, PSEOs).
--
-- These are a different regulatory category from storm overflows: an EO discharges raw sewage when a
-- pumping station fails (power cut, pump failure, blockage) to stop it backing up into homes. They are
-- EDM-monitored, but their spill data is NOT published in the water company's near-real-time storm-
-- overflow feed (NEH_outlets_PROD) or the EA EDM Annual Return storm-overflow dataset — it is only
-- obtainable by an Environmental Information Regulations (EIR) request. So there is no live feed to sync;
-- this is an annual historical record, seeded from the EIR disclosure and refreshed when a new one lands.
--
-- Schema + public RPCs run on every instance (Teign gets empty tables until it has its own EIR data).
-- The Dart seed is guarded to the Friends of the Dart org (00000000-…-001) and no-ops elsewhere,
-- exactly like the other FotD-scoped seeds (0003/0004/0010).

-- ========================================================================================
-- 1. Tables
-- ========================================================================================
create table if not exists emergency_overflows (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references organisations(id),
  overflow_name     text not null,
  permit_ref        text not null,              -- EA permit / discharge consent (some are legacy DRA/NRA refs)
  stw_catchment     text,                       -- the works catchment as named in the EIR (e.g. KILBURY_STW_BUCKFASTLEIGH)
  receiving_water   text,
  easting           integer,                    -- OSGB (EPSG:27700), as disclosed
  northing          integer,
  latitude          double precision,           -- WGS84, derived from the OSGB grid ref
  longitude         double precision,
  location          geography(Point, 4326) generated always as (
                      case when latitude is not null and longitude is not null
                        then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography else null end
                    ) stored,
  sewage_system_id  uuid references sewage_systems(id),  -- terminal works, assigned spatially (see step 3)
  edm_commissioned  text,                        -- year EDM monitoring began ('pre-2016' where earlier)
  source            text not null default 'EIR26209',
  created_at        timestamptz not null default now(),
  unique (organisation_id, permit_ref)
);
create index if not exists emergency_overflows_org_idx on emergency_overflows (organisation_id);
create index if not exists emergency_overflows_sys_idx on emergency_overflows (sewage_system_id);
create index if not exists emergency_overflows_loc_idx on emergency_overflows using gist (location);

create table if not exists eo_annual_spills (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references organisations(id),
  emergency_overflow_id uuid not null references emergency_overflows(id) on delete cascade,
  year                  integer not null,
  spill_count           integer not null default 0,   -- EA 12/24h block-counting method
  duration_hours        numeric not null default 0,
  monitored             boolean not null default true, -- false = no EDM before commissioning (a 0 here is "not monitored", not "no spills")
  partial_year          boolean not null default false,-- true for the current, incomplete year
  count_method          text not null default '12/24 block',
  source                text not null default 'EIR26209',
  created_at            timestamptz not null default now(),
  unique (emergency_overflow_id, year)
);
create index if not exists eo_annual_spills_org_idx on eo_annual_spills (organisation_id);

alter table emergency_overflows enable row level security;
alter table eo_annual_spills   enable row level security;

drop policy if exists eo_read on emergency_overflows;
create policy eo_read on emergency_overflows for select using (organisation_id = current_org());
drop policy if exists eo_admin_write on emergency_overflows;
create policy eo_admin_write on emergency_overflows for all
  using (is_admin() and organisation_id = current_org()) with check (is_admin() and organisation_id = current_org());

drop policy if exists eos_read on eo_annual_spills;
create policy eos_read on eo_annual_spills for select using (organisation_id = current_org());
drop policy if exists eos_admin_write on eo_annual_spills;
create policy eos_admin_write on eo_annual_spills for all
  using (is_admin() and organisation_id = current_org()) with check (is_admin() and organisation_id = current_org());

-- ========================================================================================
-- 2. Dart seed (EIR26209) — guarded to Friends of the Dart; no-ops on other instances
-- ========================================================================================
insert into emergency_overflows
  (organisation_id, overflow_name, permit_ref, stw_catchment, receiving_water, easting, northing, latitude, longitude, edm_commissioned, source)
select v.* from (values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'ST PETERS QUAY SPS PSEO TOTNES', '201508', 'TOTNES_STW_TOTNES', 'Dart (Tidal)', 280676, 59802, 50.425916, -3.681214, '2016', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'DARTHAVEN MARINA SPS PSEO KINGSWEAR', '202398', 'DARTMOUTH_STW_DARTMOUTH', 'Dart (Tidal)', 288365, 51163, 50.349767, -3.570444, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'MAYORS AVENUE SPST PSEO DARTMOUTH', '202401', 'DARTMOUTH_STW_DARTMOUTH', 'Dart (Tidal)', 287886, 51531, 50.352984, -3.577284, 'pre-2016', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'BRIXHAM ROAD SPS PSEO PAIGNTON', '201526', 'BROKENBURY QUARRY_STW_TORBAY', 'Dart (Tidal)', 288699, 57125, 50.403428, -3.567518, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'BLACKROCK SPS PSEO BUCKFAST', '201570', 'KILBURY_STW_BUCKFASTLEIGH', 'Dart', 274315, 66817, 50.487644, -3.773078, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'NELSON CLOSE SPS PSEO STAVERTON', '201593', 'STAVERTON_STW_STAVERTON', 'Dart', 279330, 63950, 50.462928, -3.701492, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'NORTHERN VILLAGES SPST PSEO TOTNES', '201603', 'TOTNES_STW_TOTNES', 'Dart', 279979, 61253, 50.438818, -3.691487, '2016', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'DART BRIDGE SPS PSEO BUCKFASTLEIGH', 'DRA 1464', 'KILBURY_STW_BUCKFASTLEIGH', 'Dart', 274497, 66796, 50.487495, -3.770506, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'COLES COURT SPS PSEO DARTMOUTH', '203157', 'DARTMOUTH_STW_DARTMOUTH', 'Dart (Tidal)', 287880, 51090, 50.349019, -3.577237, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'NELSON ROAD SPS PSEO DARTMOUTH', '200293', 'DARTMOUTH_STW_DARTMOUTH', 'Old Mill Creek to Dart (Tidal)', 286080, 51238, 50.350003, -3.602571, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'WARFLEET No2 SPS PSEO DARTMOUTH', '203641', 'DARTMOUTH_STW_DARTMOUTH', 'Dart (Tidal)', 288213, 50480, 50.343598, -3.572377, '2023', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'DARTMOUTH STW EO DARTMOUTH', '202518', 'DARTMOUTH_STW_DARTMOUTH', 'Old Mill Creek to Dart (Tidal)', 285964, 51943, 50.356319, -3.604414, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'MALTSTERS SPST PSEO TUCKENHAY', '201563', 'ASHPRINGTON_STW_ASHPRINGTON', 'Harbourne River to Dart (Tidal)', 281757, 56246, 50.394169, -3.664882, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'PERCHWOOD HOUSE SPS PSEO TUCKENHAY', '203147', 'ASHPRINGTON_STW_ASHPRINGTON', 'Harbourne River to Dart (Tidal)', 281510, 56297, 50.394578, -3.668371, '2016', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'DEAN PRIOR SPS PSEO DEAN PRIOR', '202151', 'KILBURY_STW_BUCKFASTLEIGH', 'Dean Burn, River Mardle to Dart', 273247, 65092, 50.471909, -3.78754, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'FULLAFORD PARK SPS PSEO BUCKFASTLEIGH', 'NRA-SW-7507', 'KILBURY_STW_BUCKFASTLEIGH', 'Dean Burn, River Mardle to Dart', 273351, 65774, 50.478062, -3.786306, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'SOUTH TOWN PSEO DARTMOUTH', '203470', 'DARTMOUTH_STW_DARTMOUTH', 'Dart Estuary', 287933, 50705, 50.345568, -3.576377, '2022', 'EIR26209'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'WARFLEET CREEK SPS_PSEO_DARTMOUTH', '202402', 'DARTMOUTH_STW_DARTMOUTH', 'Dart Estuary', 288133, 50351, 50.342423, -3.573463, '2016', 'EIR26209')
) as v(organisation_id, overflow_name, permit_ref, stw_catchment, receiving_water, easting, northing, latitude, longitude, edm_commissioned, source)
where exists (select 1 from organisations where id = '00000000-0000-0000-0000-000000000001')
on conflict (organisation_id, permit_ref) do update set
  overflow_name = excluded.overflow_name, stw_catchment = excluded.stw_catchment,
  receiving_water = excluded.receiving_water, easting = excluded.easting, northing = excluded.northing,
  latitude = excluded.latitude, longitude = excluded.longitude, edm_commissioned = excluded.edm_commissioned;

insert into eo_annual_spills
  (organisation_id, emergency_overflow_id, year, spill_count, duration_hours, monitored, partial_year, source)
select eo.organisation_id, eo.id, v.year, v.spills, v.hours, v.monitored, v.partial, 'EIR26209'
from (values
    ('201508', 2020, 4, 0.01, true, false),
    ('201508', 2021, 0, 0.0, true, false),
    ('201508', 2022, 0, 0.0, true, false),
    ('201508', 2023, 0, 0.0, true, false),
    ('201508', 2024, 0, 0.0, true, false),
    ('201508', 2025, 0, 0.0, true, true),
    ('202398', 2020, 0, 0.0, false, false),
    ('202398', 2021, 0, 0.0, false, false),
    ('202398', 2022, 2, 1.33, true, false),
    ('202398', 2023, 11, 28.34, true, false),
    ('202398', 2024, 15, 22.4, true, false),
    ('202398', 2025, 4, 1.63, true, true),
    ('202401', 2020, 0, 0.0, true, false),
    ('202401', 2021, 0, 0.0, true, false),
    ('202401', 2022, 0, 0.0, true, false),
    ('202401', 2023, 0, 0.0, true, false),
    ('202401', 2024, 1, 0.08, true, false),
    ('202401', 2025, 1, 0.2, true, true),
    ('201526', 2020, 0, 0.0, false, false),
    ('201526', 2021, 0, 0.0, false, false),
    ('201526', 2022, 0, 0.0, true, false),
    ('201526', 2023, 1, 0.06, true, false),
    ('201526', 2024, 1, 0.06, true, false),
    ('201526', 2025, 1, 0.2, true, true),
    ('201570', 2020, 0, 0.0, false, false),
    ('201570', 2021, 0, 0.0, false, false),
    ('201570', 2022, 13, 131.0, true, false),
    ('201570', 2023, 43, 375.15, true, false),
    ('201570', 2024, 35, 189.33, true, false),
    ('201570', 2025, 25, 217.02, true, true),
    ('201593', 2020, 0, 0.0, false, false),
    ('201593', 2021, 0, 0.0, false, false),
    ('201593', 2022, 5, 18.0, true, false),
    ('201593', 2023, 16, 164.48, true, false),
    ('201593', 2024, 0, 0.0, true, false),
    ('201593', 2025, 0, 0.0, true, true),
    ('201603', 2020, 0, 0.0, true, false),
    ('201603', 2021, 1, 0.04, true, false),
    ('201603', 2022, 0, 0.0, true, false),
    ('201603', 2023, 0, 0.0, true, false),
    ('201603', 2024, 0, 0.0, true, false),
    ('201603', 2025, 0, 0.0, true, true),
    ('DRA 1464', 2020, 0, 0.0, false, false),
    ('DRA 1464', 2021, 0, 0.0, false, false),
    ('DRA 1464', 2022, 13, 186.0, true, false),
    ('DRA 1464', 2023, 76, 920.14, true, false),
    ('DRA 1464', 2024, 13, 14.43, true, false),
    ('DRA 1464', 2025, 8, 19.19, true, true),
    ('203157', 2020, 0, 0.0, false, false),
    ('203157', 2021, 0, 0.0, false, false),
    ('203157', 2022, 0, 0.0, true, false),
    ('203157', 2023, 2, 1.4, true, false),
    ('203157', 2024, 0, 0.0, true, false),
    ('203157', 2025, 0, 0.0, true, true),
    ('200293', 2020, 0, 0.0, false, false),
    ('200293', 2021, 0, 0.0, false, false),
    ('200293', 2022, 1, 0.04, true, false),
    ('200293', 2023, 1, 0.45, true, false),
    ('200293', 2024, 0, 0.0, true, false),
    ('200293', 2025, 1, 0.14, true, true),
    ('203641', 2020, 0, 0.0, false, false),
    ('203641', 2021, 0, 0.0, false, false),
    ('203641', 2022, 0, 0.0, false, false),
    ('203641', 2023, 106, 2513.91, true, false),
    ('203641', 2024, 0, 0.0, true, false),
    ('203641', 2025, 0, 0.0, true, true),
    ('202518', 2020, 0, 0.0, false, false),
    ('202518', 2021, 0, 0.0, false, false),
    ('202518', 2022, 0, 0.0, true, false),
    ('202518', 2023, 11, 1.79, true, false),
    ('202518', 2024, 16, 17.96, true, false),
    ('202518', 2025, 1, 0.23, true, true),
    ('201563', 2020, 0, 0.0, false, false),
    ('201563', 2021, 0, 0.0, false, false),
    ('201563', 2022, 0, 0.0, true, false),
    ('201563', 2023, 9, 13.95, true, false),
    ('201563', 2024, 11, 15.92, true, false),
    ('201563', 2025, 1, 1.42, true, true),
    ('203147', 2020, 0, 0.0, true, false),
    ('203147', 2021, 0, 0.0, true, false),
    ('203147', 2022, 0, 0.0, true, false),
    ('203147', 2023, 0, 0.0, true, false),
    ('203147', 2024, 0, 0.0, true, false),
    ('203147', 2025, 0, 0.0, true, true),
    ('202151', 2020, 0, 0.0, false, false),
    ('202151', 2021, 0, 0.0, false, false),
    ('202151', 2022, 0, 0.0, true, false),
    ('202151', 2023, 1, 0.43, true, false),
    ('202151', 2024, 2, 0.9, true, false),
    ('202151', 2025, 2, 0.12, true, true),
    ('NRA-SW-7507', 2020, 0, 0.0, false, false),
    ('NRA-SW-7507', 2021, 0, 0.0, false, false),
    ('NRA-SW-7507', 2022, 0, 0.0, true, false),
    ('NRA-SW-7507', 2023, 0, 0.0, true, false),
    ('NRA-SW-7507', 2024, 0, 0.0, true, false),
    ('NRA-SW-7507', 2025, 0, 0.0, true, true),
    ('203470', 2020, 0, 0.0, false, false),
    ('203470', 2021, 0, 0.0, false, false),
    ('203470', 2022, 26, 54.6, true, false),
    ('203470', 2023, 65, 127.85, true, false),
    ('203470', 2024, 22, 35.18, true, false),
    ('203470', 2025, 4, 7.02, true, true),
    ('202402', 2020, 0, 0.0, true, false),
    ('202402', 2021, 1, 0.78, true, false),
    ('202402', 2022, 2, 4.73, true, false),
    ('202402', 2023, 8, 77.91, true, false),
    ('202402', 2024, 2, 1.79, true, false),
    ('202402', 2025, 1, 3.06, true, true)
) as v(permit_ref, year, spills, hours, monitored, partial)
join emergency_overflows eo
  on eo.permit_ref = v.permit_ref and eo.organisation_id = '00000000-0000-0000-0000-000000000001'
where exists (select 1 from organisations where id = '00000000-0000-0000-0000-000000000001')
on conflict (emergency_overflow_id, year) do update set
  spill_count = excluded.spill_count, duration_hours = excluded.duration_hours,
  monitored = excluded.monitored, partial_year = excluded.partial_year;

-- ========================================================================================
-- 3. Assign each EO to its terminal works — same spatial method as storm overflows (0035):
--    the wastewater-catchment polygon it falls in → that catchment's sewage_system; else the
--    nearest catchment within 3 km. Leaves sewage_system_id null if nothing is close.
-- ========================================================================================
update emergency_overflows eo set sewage_system_id = sy.id
from wastewater_catchments wwc
join sewage_systems sy on sy.organisation_id = wwc.organisation_id and sy.catchment_identifier = wwc.identifier
where eo.organisation_id = wwc.organisation_id
  and eo.location is not null
  and st_contains(wwc.geom, eo.location::geometry);

-- nearest-within-3km fallback for any EO not inside a polygon
update emergency_overflows eo set sewage_system_id = best.sys
from (
  select eo2.id as eo_id, sy.id as sys,
         row_number() over (partition by eo2.id
           order by st_distance(eo2.location, wwc.geom::geography)) as rn
  from emergency_overflows eo2
  join wastewater_catchments wwc on wwc.organisation_id = eo2.organisation_id
  join sewage_systems sy on sy.organisation_id = wwc.organisation_id and sy.catchment_identifier = wwc.identifier
  where eo2.sewage_system_id is null and eo2.location is not null
    and st_dwithin(eo2.location, wwc.geom::geography, 3000)
) best
where best.eo_id = eo.id and best.rn = 1;

-- ========================================================================================
-- 4. Public RPCs (anon-readable, org-agnostic via public_org())
-- ========================================================================================

-- One row per EO, with its annual history rolled into a jsonb array. Totals/latest/worst count only
-- MONITORED years, so pre-commissioning gaps never read as clean performance.
create or replace function public_emergency_overflows()
returns table (
  id uuid, overflow_name text, permit_ref text, stw_catchment text, receiving_water text,
  system_id uuid, system_name text, lat double precision, lng double precision, edm_commissioned text,
  total_spills int, total_hours numeric, latest_year int, latest_spills int, latest_hours numeric,
  worst_year int, worst_hours numeric, years jsonb
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  agg as (
    select s.emergency_overflow_id as eo_id,
      sum(s.spill_count) filter (where s.monitored) as total_spills,
      sum(s.duration_hours) filter (where s.monitored) as total_hours,
      jsonb_agg(jsonb_build_object('year', s.year, 'spills', s.spill_count, 'hours', s.duration_hours,
                                   'monitored', s.monitored, 'partial', s.partial_year) order by s.year) as years
    from eo_annual_spills s where s.organisation_id = (select id from org) group by s.emergency_overflow_id
  ),
  latest as (  -- latest COMPLETE year (2025 is partial/YTD and lives in the years array, not here)
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, spill_count, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year
    order by emergency_overflow_id, year desc
  ),
  worst as (
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored
    order by emergency_overflow_id, duration_hours desc, year desc
  )
  select eo.id, eo.overflow_name, eo.permit_ref, eo.stw_catchment, eo.receiving_water,
         eo.sewage_system_id, sy.name, eo.latitude, eo.longitude, eo.edm_commissioned,
         coalesce(agg.total_spills, 0)::int, coalesce(agg.total_hours, 0),
         latest.year, latest.spill_count, latest.duration_hours,
         worst.year, worst.duration_hours, coalesce(agg.years, '[]'::jsonb)
  from emergency_overflows eo
  left join sewage_systems sy on sy.id = eo.sewage_system_id
  left join agg on agg.eo_id = eo.id
  left join latest on latest.eo_id = eo.id
  left join worst on worst.eo_id = eo.id
  where eo.organisation_id = (select id from org)
  order by coalesce(agg.total_hours, 0) desc, eo.overflow_name;
$$;
grant execute on function public_emergency_overflows() to anon, authenticated;

-- EOs belonging to one works (for the cross-link panel on a storm-overflow's page).
create or replace function public_eo_for_system(p_system uuid)
returns table (
  id uuid, overflow_name text, permit_ref text,
  latest_year int, latest_hours numeric, total_hours numeric, worst_hours numeric
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  latest as (  -- latest COMPLETE year
    select distinct on (emergency_overflow_id) emergency_overflow_id as eo_id, year, duration_hours
    from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year
    order by emergency_overflow_id, year desc
  )
  select eo.id, eo.overflow_name, eo.permit_ref,
    latest.year, latest.duration_hours,
    (select coalesce(sum(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored),
    (select coalesce(max(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored)
  from emergency_overflows eo
  left join latest on latest.eo_id = eo.id
  where eo.organisation_id = (select id from org) and eo.sewage_system_id = p_system
  order by (select coalesce(sum(duration_hours), 0) from eo_annual_spills s where s.emergency_overflow_id = eo.id and s.monitored) desc;
$$;
grant execute on function public_eo_for_system(uuid) to anon, authenticated;

-- Headline totals for the board callout. lfy = latest complete (non-partial) year.
create or replace function public_eo_summary()
returns table (
  eo_count int, active_count int, lfy int, hours_lfy numeric, worst_name text, worst_hours numeric
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select max(year) as y from eo_annual_spills where organisation_id = (select id from org) and monitored and not partial_year),
  lfy_rows as (
    select eo.overflow_name, s.duration_hours
    from eo_annual_spills s join emergency_overflows eo on eo.id = s.emergency_overflow_id
    where s.organisation_id = (select id from org) and s.monitored and s.year = (select y from lfy)
  )
  select
    (select count(*)::int from emergency_overflows where organisation_id = (select id from org)),
    (select count(*)::int from lfy_rows where duration_hours > 0),
    (select y from lfy),
    (select coalesce(sum(duration_hours), 0) from lfy_rows),
    (select overflow_name from lfy_rows order by duration_hours desc limit 1),
    (select coalesce(max(duration_hours), 0) from lfy_rows);
$$;
grant execute on function public_eo_summary() to anon, authenticated;
