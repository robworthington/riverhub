-- River Hub — protected & priority water sites (see PRIORITY-SITES-METHOD.md).
-- Layer 1: Shellfish Water Protected Areas. One row per designated feature; geometry stored in
-- WGS84 (4326). Extensible to bathing waters, SAC/SPA/Ramsar/SSSI, NVZ, NN catchments via the
-- `designation` discriminator. `sodrp_high_priority` flags SODRP high-priority designations.
create table if not exists protected_areas (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id) on delete cascade,
  designation         text not null,   -- 'shellfish_pa' | 'bathing_water' | 'sac' | 'spa' |
                                        --   'ramsar' | 'sssi' | 'mcz' | 'drinking_water_pa' |
                                        --   'nvz' | 'nn_catchment'
  source_id           text,            -- native dataset id (sfw_id, bathing-water id, NE code…)
  name                text,
  wfd_wb_id           text,            -- WFD water-body ref where the dataset provides one
  sodrp_high_priority boolean not null default false,
  geom                geometry(Geometry, 4326) not null,
  attrs               jsonb not null default '{}'::jsonb,
  source              text,
  created_at          timestamptz not null default now(),
  unique (organisation_id, designation, source_id)
);
create index if not exists protected_areas_geom_idx on protected_areas using gist (geom);
create index if not exists protected_areas_org_desig_idx on protected_areas (organisation_id, designation);

alter table protected_areas enable row level security;
create policy protected_areas_read on protected_areas for select using (organisation_id = current_org());
create policy protected_areas_admin_write on protected_areas for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- Public portal RPC (OGL public data, over public_org()) ----------
-- Returns designated sites as GeoJSON for map layers. Optional filter by designation.
create or replace function public_protected_areas(p_designation text default null)
returns table (id uuid, designation text, source_id text, name text, wfd_wb_id text,
               sodrp_high_priority boolean, geojson text)
language sql stable security definer set search_path = public as $$
  select id, designation, source_id, name, wfd_wb_id, sodrp_high_priority, ST_AsGeoJSON(geom)
  from protected_areas
  where organisation_id = public_org()
    and (p_designation is null or designation = p_designation)
  order by designation, name;
$$;
grant execute on function public_protected_areas(text) to anon, authenticated;

-- Which of an area's parishes a designated site overlaps (members council/parish pages).
create or replace function protected_areas_for_parishes(p_ids uuid[], p_designation text default null)
returns table (id uuid, designation text, name text, source_id text, sodrp_high_priority boolean)
language sql stable security definer set search_path = public as $$
  select distinct pa.id, pa.designation, pa.name, pa.source_id, pa.sodrp_high_priority
  from protected_areas pa
  join parishes p on p.id = any(p_ids) and p.boundary is not null
    and ST_Intersects(pa.geom, p.boundary)
  where pa.organisation_id = public_org()
    and (p_designation is null or pa.designation = p_designation)
  order by pa.designation, pa.name;
$$;
grant execute on function protected_areas_for_parishes(uuid[], text) to anon, authenticated;
