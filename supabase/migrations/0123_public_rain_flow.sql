-- 0123: Rain and river flow on the public site (Why it happens > Rain and river flow).
--
-- The EA rain gauges and river-flow gauges each river uses were only visible to signed-in members
-- (/environment). They are open EA data (Open Government Licence), and every dry-spill finding rests
-- on them, so the public pages now show them. Read-only, per river (p_org), like the other public_*.
-- A "wet" day is more than 0.25 mm, the threshold the dry-spill classification uses (classify_spills).
--
-- public_rain_stations(p_org): each gauge with its latest reading, rain in the last 7 and 30 days,
--   wet days in the last 30, and how many of the river's overflows are judged against it.
-- public_rain_station(p_org, p_station): one gauge, a year of daily readings, and its overflows.
-- public_flow_gauges(p_org): each river-flow gauge with a year of daily mean flow.

create or replace function public.public_rain_stations(p_org uuid)
returns table(id uuid, name text, latitude double precision, longitude double precision, latest date,
              rain_7d numeric, rain_30d numeric, wet_days_30 integer, days_30 integer, overflows integer)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.latitude, s.longitude,
         (select max(r.reading_date) from rainfall_readings r where r.station_id = s.id),
         round(coalesce(sum(r.rainfall_mm) filter (where r.reading_date > current_date - 7), 0)::numeric, 1),
         round(coalesce(sum(r.rainfall_mm), 0)::numeric, 1),
         (count(*) filter (where r.rainfall_mm > 0.25))::int,
         (count(r.reading_date))::int,
         (select count(*) from sewage_assets a where a.organisation_id = p_org and a.rainfall_station_id = s.id)::int
  from rainfall_stations s
  left join rainfall_readings r on r.station_id = s.id and r.reading_date > current_date - 30
  where s.organisation_id = p_org
  group by s.id
  order by 10 desc, s.name;
$$;

create or replace function public.public_rain_station(p_org uuid, p_station uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'name', s.name, 'ea_station_id', s.ea_station_id, 'latitude', s.latitude, 'longitude', s.longitude,
    'readings', coalesce((
      select jsonb_agg(jsonb_build_array(r.reading_date, round(r.rainfall_mm::numeric, 1)) order by r.reading_date)
      from rainfall_readings r where r.station_id = s.id and r.reading_date > current_date - 366), '[]'::jsonb),
    'overflows', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.asset_name, 'type', a.asset_type) order by a.asset_name)
      from sewage_assets a where a.organisation_id = p_org and a.rainfall_station_id = s.id), '[]'::jsonb)
  ) end
  from (select * from rainfall_stations where id = p_station and organisation_id = p_org) s
$$;

create or replace function public.public_flow_gauges(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'ea_station_id', g.ea_station_id,
    'readings', coalesce((
      select jsonb_agg(jsonb_build_array(f.reading_date, round(f.flow_m3s::numeric, 3)) order by f.reading_date)
      from flow_readings f where f.gauge_id = g.id and f.flow_m3s is not null and f.reading_date > current_date - 366), '[]'::jsonb)
  ) order by g.name), '[]'::jsonb)
  from river_gauges g
  where g.organisation_id = p_org
$$;

revoke all on function public.public_rain_stations(uuid) from public;
revoke all on function public.public_rain_station(uuid, uuid) from public;
revoke all on function public.public_flow_gauges(uuid) from public;
grant execute on function public.public_rain_stations(uuid) to anon, authenticated;
grant execute on function public.public_rain_station(uuid, uuid) to anon, authenticated;
grant execute on function public.public_flow_gauges(uuid) to anon, authenticated;
