-- River Hub — population demand vs permit vs actual capacity (see POPULATION-CAPACITY-METHOD.md)
-- Editable per-system assumptions: ONS supplies base P (refreshable), local knowledge tunes it,
-- the low/high band is a ± % variation. Permit requirement + actual capacity live on the works asset.

-- 1:1 with sewage_systems. Org-scoped; admin write, org read.
create table system_assumptions (
  system_id           uuid primary key references sewage_systems(id) on delete cascade,
  organisation_id     uuid not null references organisations(id),
  -- P (resident base): ONS-derived, refreshable, with a manual override
  ons_population      int,
  ons_calculated_at   timestamptz,
  ons_source          text,
  population_override int,                              -- local knowledge beats ONS when set
  -- tunable assumptions (editable in UI; defaults decided 2026-06-08)
  g_lhd               numeric not null default 140,     -- per-capita flow l/head/day (central)
  low_variation_pct   numeric not null default 15,      -- LOW end: subtract this % (off-mains etc.)
  high_variation_pct  numeric not null default 50,      -- HIGH end: add this % (tourism/2nd homes)
  infiltration_m3d    numeric not null default 0,       -- optional I
  trade_effluent_m3d  numeric not null default 0,       -- optional E
  notes               text,                             -- record the local reasoning
  updated_by          uuid references profiles(id),
  updated_at          timestamptz not null default now()
);
create index on system_assumptions (organisation_id);

alter table system_assumptions enable row level security;
create policy sysasmp_read on system_assumptions for select
  using (organisation_id = current_org());
create policy sysasmp_admin_write on system_assumptions for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- Permit requirement (from the EA permit) — extend asset_permits
alter table asset_permits add column if not exists permit_dwf_m3d numeric; -- consented dry weather flow
alter table asset_permits add column if not exists permit_fft_m3d numeric; -- flow to full treatment / pass-forward
alter table asset_permits add column if not exists permit_pe      integer; -- design population equivalent

-- Actual installed capacity (EIR-sourced) — extend sewage_assets (the works asset)
alter table sewage_assets add column if not exists actual_capacity_m3d   numeric;
alter table sewage_assets add column if not exists actual_capacity_source text;
alter table sewage_assets add column if not exists eir_ref               text;
alter table sewage_assets add column if not exists eir_requested_on      date;
alter table sewage_assets add column if not exists eir_received_on       date;

-- Computed range per system. security_invoker so RLS scopes to the caller's org.
create view system_capacity_v with (security_invoker = true) as
select
  sa.system_id,
  sa.organisation_id,
  sa.g_lhd,
  sa.low_variation_pct,
  sa.high_variation_pct,
  sa.infiltration_m3d,
  sa.trade_effluent_m3d,
  sa.ons_population,
  sa.ons_calculated_at,
  sa.ons_source,
  sa.population_override,
  sa.notes,
  sa.updated_at,
  coalesce(sa.population_override, sa.ons_population)                              as effective_population,
  round(coalesce(sa.population_override, sa.ons_population) * (1 - sa.low_variation_pct  / 100.0))::int  as pop_low,
  round(coalesce(sa.population_override, sa.ons_population) * (1 + sa.high_variation_pct / 100.0))::int  as pop_high,
  -- demand m3/day = P * G / 1000  (+ infiltration + trade effluent)
  round((coalesce(sa.population_override, sa.ons_population) * (1 - sa.low_variation_pct  / 100.0) * sa.g_lhd / 1000.0)
        + sa.infiltration_m3d + sa.trade_effluent_m3d, 1) as demand_low_m3d,
  round((coalesce(sa.population_override, sa.ons_population) * sa.g_lhd / 1000.0)
        + sa.infiltration_m3d + sa.trade_effluent_m3d, 1) as demand_central_m3d,
  round((coalesce(sa.population_override, sa.ons_population) * (1 + sa.high_variation_pct / 100.0) * sa.g_lhd / 1000.0)
        + sa.infiltration_m3d + sa.trade_effluent_m3d, 1) as demand_high_m3d
from system_assumptions sa;

grant select on system_capacity_v to authenticated;

-- Census 2021 resident population per parish (OA→parish best-fit; loaded by
-- scripts/estimate_system_population.py). Stored so the in-app refresh is a cheap SQL sum.
alter table parishes add column if not exists census_2021_population int;

-- In-app "Refresh from ONS": sum the census population of the distinct parishes that contain
-- the system's geocoded assets (point-in-polygon). SECURITY INVOKER → RLS scopes to caller.
create or replace function system_ons_population(p_system uuid)
returns int
language sql
stable
as $$
  select coalesce(sum(pp.census_2021_population), 0)::int
  from (
    select distinct p.id, p.census_2021_population
    from parishes p
    join sewage_assets a
      on a.sewage_system_id = p_system
     and a.latitude is not null and a.longitude is not null
     and st_contains(p.boundary, st_setsrid(st_point(a.longitude, a.latitude), 4326))
    where p.census_2021_population is not null
  ) pp;
$$;

grant execute on function system_ons_population(uuid) to authenticated;
