-- River Hub — EA Water Quality Archive per-SAMPLE observations (granular, sample-level).
-- See WATER-TESTING-DATA-SOURCES.md. The EA re-platformed the WQ Archive to a FastAPI service
-- (OpenAPI at /water-quality/openapi.json); per-sample data is the "observation" resource:
--   GET /water-quality/sampling-point/{notation}/observation  (Accept: text/csv)
-- giving phenomenonTime + determinand + result + unit per sample. Loaded by
-- scripts/import_ea_wq_samples.py. OGL v3. Complements ea_wq_stats (yearly summary) and the group's
-- own citizen test_results — kept as a separate, clearly-attributed EA monitoring source.

create table ea_wq_samples (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  notation        text not null,          -- EA sampling-point notation (SW-…)
  site_label      text,
  determinand     text not null,          -- EA determinand prefLabel (e.g. 'Orthophosphate')
  unit            text,
  result          numeric,
  sampled_at      timestamptz not null,   -- phenomenonTime
  sample_material text,
  purpose         text,
  wb_name         text,
  latitude        double precision,
  longitude       double precision,
  location        geography(Point, 4326)
                    generated always as (
                      case when latitude is not null and longitude is not null
                        then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography end
                    ) stored,
  source          text default 'ea-wqa-obs',
  created_at      timestamptz not null default now(),
  unique (organisation_id, notation, determinand, sampled_at)
);
create index on ea_wq_samples (organisation_id);
create index on ea_wq_samples (notation);
create index on ea_wq_samples (determinand);
create index on ea_wq_samples (organisation_id, notation, determinand);
create index on ea_wq_samples using gist (location);

alter table ea_wq_samples enable row level security;
create policy ea_wqs_read on ea_wq_samples for select using (organisation_id = current_org());
create policy ea_wqs_admin_write on ea_wq_samples for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- Public portal RPCs (OGL public data, over public_org()) ----------

-- One row per EA sampling point: location, water body, determinand list, sample count, latest sample.
create or replace function public_ea_wq_sites()
returns table (notation text, site_label text, latitude double precision, longitude double precision,
               wb_name text, determinands text[], n_samples bigint, latest_sample timestamptz)
language sql stable security definer set search_path = public as $$
  select notation, max(site_label), max(latitude), max(longitude), max(wb_name),
         array_agg(distinct determinand order by determinand), count(*), max(sampled_at)
  from ea_wq_samples where organisation_id = public_org()
  group by notation
  order by max(site_label);
$$;
grant execute on function public_ea_wq_sites() to anon, authenticated;

-- All samples for one EA site (drives the per-site chart + grid + determinand selector).
create or replace function public_ea_wq_site_samples(p_notation text)
returns table (determinand text, unit text, result numeric, sampled_at timestamptz, purpose text)
language sql stable security definer set search_path = public as $$
  select determinand, unit, result, sampled_at, purpose
  from ea_wq_samples
  where organisation_id = public_org() and notation = p_notation
  order by determinand, sampled_at;
$$;
grant execute on function public_ea_wq_site_samples(text) to anon, authenticated;
