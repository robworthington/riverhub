-- Public spill map pins (PUBLIC-SITE-REDESIGN.md, Phase 4). Latest live status + coordinates per
-- monitored overflow, for the live-status pin layer on /explore/spills/map. Anon-readable.

create or replace function public_spill_pins()
returns table (
  asset_id uuid, asset_name text, lat double precision, lng double precision,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  snap as (
    select distinct on (asset_id)
           asset_id, status, status_start, latest_event_start, latest_event_end, coalesce(last_updated, captured_at) lu
    from edm_snapshots where organisation_id = (select id from org)
    order by asset_id, captured_at desc
  )
  select a.id, a.asset_name, a.latitude, a.longitude,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu
  from sewage_assets a
  join snap s on s.asset_id = a.id
  where a.organisation_id = (select id from org)
    and a.latitude is not null and a.longitude is not null;
$$;

grant execute on function public_spill_pins() to anon, authenticated;
