-- River Hub — EA Water Quality Archive (WIMS) monitoring data. See WATER-TESTING-DATA-SOURCES.md.
-- The EA's routine laboratory monitoring (chemistry/nutrients: ammonia, nitrate, orthophosphate,
-- dissolved oxygen, pH, conductivity, temperature), per sampling point × determinand × year
-- (count/min/max/mean) + the latest reading. Open Government Licence v3 (attribute Environment
-- Agency). Sourced from the CaBA/Rivers Trust ArcGIS mirror of the WQA summary statistics; loaded by
-- scripts/import_water_quality_ea.py. This is a PARALLEL "EA monitoring" source — kept separate from
-- the group's own citizen test_results.

create table ea_wq_stats (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  notation        text not null,        -- EA sampling-point notation (e.g. SW-70649999)
  site_label      text,
  determinand     text not null,        -- e.g. 'Orthophospht', 'Ammonia(N)', 'Nitrate-N'
  unit            text,
  wb_name         text,                 -- WFD water body
  wb_cat          text,
  wfd_site        boolean,
  caba_catchment  text,
  year            int not null,
  n               int,
  vmin            numeric,
  vmax            numeric,
  vmean           numeric,
  latest_sample   date,                 -- most recent sample date (overall, on the latest year row)
  latest_result   numeric,
  latitude        double precision,
  longitude       double precision,
  location        geography(Point, 4326)
                    generated always as (
                      case when latitude is not null and longitude is not null
                        then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography end
                    ) stored,
  source          text default 'ea-wqa',
  created_at      timestamptz not null default now(),
  unique (organisation_id, notation, determinand, year)
);
create index on ea_wq_stats (organisation_id);
create index on ea_wq_stats (determinand);
create index on ea_wq_stats using gist (location);

alter table ea_wq_stats enable row level security;
create policy ea_wq_read on ea_wq_stats for select using (organisation_id = current_org());
create policy ea_wq_admin_write on ea_wq_stats for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- Public portal (WQA is OGL public data) — over the public_org() slice, anon-granted.
create or replace function public_ea_wq()
returns table (notation text, site_label text, latitude double precision, longitude double precision,
               wb_name text, determinand text, unit text, year int, n int,
               vmin numeric, vmax numeric, vmean numeric, latest_sample date, latest_result numeric)
language sql stable security definer set search_path = public as $$
  select notation, site_label, latitude, longitude, wb_name, determinand, unit, year, n,
         vmin, vmax, vmean, latest_sample, latest_result
  from ea_wq_stats
  where organisation_id = public_org()
  order by site_label, determinand, year;
$$;
grant execute on function public_ea_wq() to anon, authenticated;
