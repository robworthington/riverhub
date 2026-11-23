-- River Hub — pollution incidents from the Environment Agency's National Incident Recording System
-- (design canvas "Pollution incidents (NIRS)").
--
-- Source: EA "Environmental Pollution Incidents (Category 1 and 2)" — substantiated, closed incidents
-- with a major (1) or significant (2) impact on water, land or air, a quarterly snapshot of NIRS2,
-- published as a ZIP holding a Microsoft Access database. The weekly cron /api/cron/pollution-incidents
-- downloads and parses it and loads it here through load_pollution_incidents(), then
-- assign_pollution_incidents() links each incident to the nearest River Hub overflow or works.
--
-- Licence: EA Conditional Licence — republishing, including individual records, is allowed with the
-- EA's attribution. It lapses after a year, so each weekly download renews it. The dataset warns that
-- it contains personal data (sites run by individuals), so the public functions only return incidents
-- involving sewage that fall near River Hub's network, with locations rounded to about 100 m, and
-- never the address fields. The EA also warns: "no inference should be drawn that the site or property
-- owner necessarily was responsible" — the pages say "near", never "caused by".

create table if not exists pollution_incidents (
  not_id            integer primary key,                 -- NIRS notification id
  occurred_at       timestamp,                           -- as recorded (UK local wall-clock time)
  easting           integer,
  northing          integer,
  ngr               text,
  geom              geography(Point, 4326),
  region            text,
  area              text,
  county            text,
  district          text,
  eil_water         smallint check (eil_water between 1 and 4),  -- environmental impact category
  eil_land          smallint check (eil_land between 1 and 4),
  eil_air           smallint check (eil_air between 1 and 4),
  pollutant_types   text[] not null default '{}',
  pollutants        text[] not null default '{}',
  is_sewage         boolean not null default false,      -- any pollutant of type "Sewage Materials"
  organisation_id   uuid references organisations(id) on delete set null,
  nearest_asset_id  uuid references sewage_assets(id) on delete set null,
  nearest_asset_m   integer,
  loaded_at         timestamptz not null default now()
);
create index if not exists pollution_incidents_geom_idx on pollution_incidents using gist (geom);
create index if not exists pollution_incidents_org_idx on pollution_incidents (organisation_id, occurred_at desc)
  where organisation_id is not null;
create index if not exists pollution_incidents_asset_idx on pollution_incidents (nearest_asset_id)
  where nearest_asset_id is not null;
create index if not exists sewage_assets_location_gix on sewage_assets using gist (location);

-- Reference data written only by the service role (the cron); nobody reads the table directly.
alter table pollution_incidents enable row level security;
revoke all on pollution_incidents from anon, authenticated;

-- "Category 2 (Significant)" → 2.
create or replace function nirs_category(t text) returns smallint
language sql immutable as $$
  select nullif(substring(t from 'Category\s*([1-4])'), '')::smallint
$$;

-- Upsert one batch of incidents (a JSON array from the cron). Each element:
--   {id, at, e, n, ngr, region, area, county, district, water, land, air, types[], pollutants[]}
create or replace function load_pollution_incidents(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into pollution_incidents as p (
    not_id, occurred_at, easting, northing, ngr, geom, region, area, county, district,
    eil_water, eil_land, eil_air, pollutant_types, pollutants, is_sewage, loaded_at
  )
  select
    (r->>'id')::integer,
    nullif(r->>'at', '')::timestamp,
    nullif(r->>'e', '')::integer,
    nullif(r->>'n', '')::integer,
    nullif(trim(r->>'ngr'), ''),
    case when nullif(r->>'e', '') is not null and nullif(r->>'n', '') is not null
      then st_transform(st_setsrid(st_makepoint((r->>'e')::float8, (r->>'n')::float8), 27700), 4326)::geography end,
    nullif(trim(r->>'region'), ''),
    nullif(trim(r->>'area'), ''),
    nullif(trim(r->>'county'), ''),
    nullif(trim(r->>'district'), ''),
    nirs_category(r->>'water'),
    nirs_category(r->>'land'),
    nirs_category(r->>'air'),
    coalesce(array(select distinct jsonb_array_elements_text(r->'types')), '{}'),
    coalesce(array(select distinct jsonb_array_elements_text(r->'pollutants')), '{}'),
    coalesce(r->'types' ? 'Sewage Materials', false),
    now()
  from jsonb_array_elements(p_rows) r
  where (r->>'id') ~ '^\d+$'
  on conflict (not_id) do update set
    occurred_at = excluded.occurred_at, easting = excluded.easting, northing = excluded.northing,
    ngr = excluded.ngr, geom = excluded.geom, region = excluded.region, area = excluded.area,
    county = excluded.county, district = excluded.district, eil_water = excluded.eil_water,
    eil_land = excluded.eil_land, eil_air = excluded.eil_air, pollutant_types = excluded.pollutant_types,
    pollutants = excluded.pollutants, is_sewage = excluded.is_sewage, loaded_at = excluded.loaded_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- Link every incident to the nearest River Hub overflow or works within 1 km (and so to that river).
-- Returns the number of incidents linked.
create or replace function assign_pollution_incidents() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update pollution_incidents p set organisation_id = null, nearest_asset_id = null, nearest_asset_m = null
    where p.nearest_asset_id is not null;
  with nearest as (
    select p.not_id, a.id as asset_id, a.organisation_id, round(st_distance(p.geom, a.location))::integer as m
    from pollution_incidents p
    cross join lateral (
      select sa.id, sa.organisation_id, sa.location
      from sewage_assets sa
      join organisations o on o.id = sa.organisation_id and o.live
      where sa.location is not null and st_dwithin(p.geom, sa.location, 1000)
      order by p.geom <-> sa.location
      limit 1
    ) a
    where p.geom is not null
  )
  update pollution_incidents p set organisation_id = nearest.organisation_id, nearest_asset_id = nearest.asset_id,
    nearest_asset_m = nearest.m
  from nearest where nearest.not_id = p.not_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- public read ----------

-- Sewage incidents with a serious (category 1 or 2) impact on water, linked to a river (and optionally
-- one overflow, within 250 m). Locations rounded to about 100 m; no address fields.
create or replace function public_pollution_incidents(p_org uuid, p_asset uuid default null, p_limit integer default 50)
returns table (
  not_id integer, occurred_on date, category smallint, pollutants text[],
  asset_id uuid, asset_name text, asset_type text, distance_m integer, lat double precision, lng double precision
)
language sql stable security definer set search_path = public as $$
  select p.not_id, p.occurred_at::date, p.eil_water,
         array(select x from unnest(p.pollutants) x where x in ('Crude Sewage', 'Storm Sewage', 'Final Effluent',
           'Grey Water', 'Other Sewage Material', 'Sludge', 'Process Effluent')),
         a.id, a.asset_name, a.asset_type, (round(p.nearest_asset_m / 10.0) * 10)::integer,
         round(st_y(p.geom::geometry)::numeric, 3)::float8, round(st_x(p.geom::geometry)::numeric, 3)::float8
  from pollution_incidents p
  join organisations o on o.id = p.organisation_id and o.live
  left join sewage_assets a on a.id = p.nearest_asset_id
  where p.organisation_id = p_org and p.is_sewage and p.eil_water in (1, 2)
    and (p_asset is null or (p.nearest_asset_id = p_asset and p.nearest_asset_m <= 250))
  order by p.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- Headline counts for a river, and when the data was last refreshed.
create or replace function public_pollution_incident_summary(p_org uuid)
returns table (total integer, since_2020 integer, category_1 integer, latest date, refreshed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select count(*)::integer,
         count(*) filter (where p.occurred_at >= '2020-01-01')::integer,
         count(*) filter (where p.eil_water = 1)::integer,
         max(p.occurred_at)::date,
         (select max(loaded_at) from pollution_incidents)
  from pollution_incidents p
  join organisations o on o.id = p.organisation_id and o.live
  where p.organisation_id = p_org and p.is_sewage and p.eil_water in (1, 2)
$$;

-- Writers: service role only. Supabase grants EXECUTE on new functions to anon by default.
revoke all on function load_pollution_incidents(jsonb) from public, anon, authenticated;
revoke all on function assign_pollution_incidents() from public, anon, authenticated;
grant execute on function load_pollution_incidents(jsonb) to service_role;
grant execute on function assign_pollution_incidents() to service_role;
grant execute on function public_pollution_incidents(uuid, uuid, integer) to anon, authenticated;
grant execute on function public_pollution_incident_summary(uuid) to anon, authenticated;
