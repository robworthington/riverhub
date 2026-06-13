-- River Hub — M3a: EA rainfall + river-flow context data

-- ---------- River flow gauges ----------
create table river_gauges (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  ea_station_id   text,
  ea_measure_flow  text,
  ea_measure_level text,
  water_body_id   uuid references water_bodies(id),
  latitude        double precision,
  longitude       double precision,
  ea_enabled      boolean not null default true,
  created_at      timestamptz not null default now()
);

create table flow_readings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  gauge_id        uuid not null references river_gauges(id) on delete cascade,
  reading_date    date not null,
  flow_m3s        numeric,
  level_m         numeric,
  fetched_at      timestamptz not null default now(),
  unique (gauge_id, reading_date)
);
create index on flow_readings (gauge_id, reading_date desc);

-- ---------- Rainfall stations ----------
create table rainfall_stations (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id),
  name                text not null,
  ea_station_id       text,
  ea_measure_rainfall text,
  latitude            double precision,
  longitude           double precision,
  ea_enabled          boolean not null default true,
  created_at          timestamptz not null default now()
);

create table rainfall_readings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  station_id      uuid not null references rainfall_stations(id) on delete cascade,
  reading_date    date not null,
  rainfall_mm     numeric,
  fetched_at      timestamptz not null default now(),
  unique (station_id, reading_date)
);
create index on rainfall_readings (station_id, reading_date desc);

-- ---------- RLS ----------
alter table river_gauges       enable row level security;
alter table flow_readings      enable row level security;
alter table rainfall_stations  enable row level security;
alter table rainfall_readings  enable row level security;

create policy gauge_read on river_gauges for select using (organisation_id = current_org());
create policy gauge_admin_write on river_gauges for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

create policy flow_read on flow_readings for select using (organisation_id = current_org());
create policy flow_admin_write on flow_readings for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

create policy rain_station_read on rainfall_stations for select using (organisation_id = current_org());
create policy rain_station_admin_write on rainfall_stations for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

create policy rain_read on rainfall_readings for select using (organisation_id = current_org());
create policy rain_admin_write on rainfall_readings for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- Seed: real Dart-catchment EA stations ----------
insert into river_gauges
  (organisation_id, name, ea_station_id, ea_measure_flow, ea_measure_level,
   water_body_id, latitude, longitude)
select '00000000-0000-0000-0000-000000000001',
       'Austins Bridge',
       'fd8ea26c-8052-48c5-a1bb-bbd5ebbbb3d3',
       'fd8ea26c-8052-48c5-a1bb-bbd5ebbbb3d3-flow-m-86400-m3s-qualified',
       'fd8ea26c-8052-48c5-a1bb-bbd5ebbbb3d3-level-max-86400-m-qualified',
       wb.id, 50.479041, -3.761515
from water_bodies wb
where wb.organisation_id = '00000000-0000-0000-0000-000000000001' and wb.code = '00005';

insert into rainfall_stations
  (organisation_id, name, ea_station_id, ea_measure_rainfall, latitude, longitude)
select '00000000-0000-0000-0000-000000000001',
   'Holne Priddons Farm',
   'b000c3f6-3922-48ea-8726-4173de4998d0',
   'b000c3f6-3922-48ea-8726-4173de4998d0-rainfall-t-86400-mm-qualified',
   50.516929, -3.841878
-- guard: no-op on a fresh (non-FotD) instance (federation F1/F6)
where exists (select 1 from organisations where id = '00000000-0000-0000-0000-000000000001');
