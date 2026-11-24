-- 0105 — More detail on public pollution incidents, for the river map and the incident lists.
--
-- The EA's open dataset (category 1 and 2 incidents) has no description, cause, watercourse,
-- responsible party or enforcement outcome. What it does have, and 0100 already stores but didn't
-- return:
--   * occurred_time: the time the incident was recorded (UK local time), "HH24:MI";
--   * land_category: impact on land (1 major, 2 significant, 3 minor, 4 none), as well as water;
--   * not_id (already returned): the EA's notification reference, which the pages use to pre-fill
--     an EIR request to the EA for the full incident report.
-- Locations stay rounded to about 100 m and no address fields are returned (0100's privacy rules).
-- The return type changes, so drop and recreate; grants re-applied below.

drop function if exists public_pollution_incidents(uuid, uuid, integer);

create or replace function public_pollution_incidents(p_org uuid, p_asset uuid default null, p_limit integer default 50)
returns table (
  not_id integer, occurred_on date, occurred_time text, category smallint, land_category smallint,
  pollutants text[], asset_id uuid, asset_name text, asset_type text, distance_m integer,
  lat double precision, lng double precision
)
language sql stable security definer set search_path = public as $$
  select p.not_id, p.occurred_at::date, to_char(p.occurred_at, 'HH24:MI'), p.eil_water, p.eil_land,
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

revoke all on function public_pollution_incidents(uuid, uuid, integer) from public;
grant execute on function public_pollution_incidents(uuid, uuid, integer) to anon, authenticated;
