-- 0136: Natural Resources Wales's pollution incidents beside the EA's (WALES-ROLLOUT-PLAN.md §5).
--
-- NRW publishes its own "Environmental Pollution Incidents" dataset (NRW_DS116253, OGL v3): substantiated,
-- closed incidents in Wales since March 2016, as one spreadsheet. scripts/import_nrw_incidents.py loads it
-- into pollution_incidents, so the incident pages, map and counts include Welsh incidents unchanged.
--
-- * source: who published the record, 'ea-nirs' (every row before this migration) or 'nrw-epi'.
-- * source_ref: the publisher's own reference. NRW's event ids come from the same number range as the
--   EA's notification ids (about 7 of the 1,447 NRW ids are also EA ids), so an NRW row is stored with
--   not_id = 1,000,000,000 + its event id and keeps the real id here. Pages show and request reports
--   by source_ref.
-- * public_pollution_incidents also returns source and ref; occurred_time is null for NRW rows, whose
--   records carry a date only.
-- The EA's weekly cron only upserts EA ids, so it never touches the NRW rows.

alter table public.pollution_incidents
  add column if not exists source text not null default 'ea-nirs' check (source in ('ea-nirs', 'nrw-epi')),
  add column if not exists source_ref text;

drop function if exists public.public_pollution_incidents(uuid, uuid, integer);
create function public.public_pollution_incidents(p_org uuid, p_asset uuid default null, p_limit integer default 50)
returns table (
  not_id integer, occurred_on date, occurred_time text, category smallint, land_category smallint, pollutants text[],
  asset_id uuid, asset_name text, asset_type text, distance_m integer, lat double precision, lng double precision,
  source text, ref text
)
language sql stable security definer set search_path = public, extensions as $$
  select p.not_id, p.occurred_at::date,
         case when p.source = 'nrw-epi' then null else to_char(p.occurred_at, 'HH24:MI') end,
         p.eil_water, p.eil_land,
         array(select x from unnest(p.pollutants) x where x in ('Crude Sewage', 'Storm Sewage', 'Final Effluent',
           'Grey Water', 'Other Sewage Material', 'Sludge', 'Process Effluent')),
         a.id, a.asset_name, a.asset_type, (round(p.nearest_asset_m / 10.0) * 10)::integer,
         round(st_y(p.geom::geometry)::numeric, 3)::float8, round(st_x(p.geom::geometry)::numeric, 3)::float8,
         p.source, coalesce(p.source_ref, p.not_id::text)
  from pollution_incidents p
  join organisations o on o.id = p.organisation_id and o.live
  left join sewage_assets a on a.id = p.nearest_asset_id
  where p.organisation_id = p_org and p.is_sewage and p.eil_water in (1, 2)
    and (p_asset is null or (p.nearest_asset_id = p_asset and p.nearest_asset_m <= 250))
  order by p.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;
grant execute on function public.public_pollution_incidents(uuid, uuid, integer) to anon, authenticated;
