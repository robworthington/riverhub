-- Surface the bathing / shellfish water association on the asset overview page.
--
-- sewage_assets.bathing_water (and shellfish_water) already drive the "Bathing water" fact on the
-- per-spill evidence dossier, but the asset header RPC never returned them, so the overview page could
-- not show the designation. Add both columns to public_spill_asset. No logic change otherwise — this
-- is 0072's definition with two columns appended (return signature changes, so drop+recreate).

drop function if exists public_spill_asset(uuid);
create function public_spill_asset(p_asset uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry_all int, total_all int, pre_stw_all int, first_year int,
  last_spill_end timestamptz,
  bathing_water text, shellfish_water text
)
language sql stable security definer set search_path = public as $$
  with snap as (
    select status, status_start, latest_event_start, latest_event_end, captured_at lu
    from edm_snapshots where asset_id = p_asset order by captured_at desc limit 1
  ),
  y as (select coalesce(sum(dry), 0)::int dry, coalesce(sum(dry + wet + unknown), 0)::int total, min(year) fy from classify_spills_yearly(p_asset)),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank') and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  ),
  up as (select e.event_start::date as day from spill_events e where e.asset_id = p_asset and (e.duration_minutes is null or e.duration_minutes >= 15)),
  pre as (select count(*) filter (where wd.day is null)::int n from up left join wd on wd.day = up.day)
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu, y.dry, y.total, pre.n, y.fy,
         (select max(e.event_end) from spill_events e
            where e.asset_id = p_asset and e.event_end is not null
              and (e.duration_minutes is null or e.duration_minutes >= 15)) as last_spill_end,
         a.bathing_water, a.shellfish_water
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join snap s on true cross join y cross join pre
  where a.id = p_asset and a.organisation_id = (select public_org());
$$;
grant execute on function public_spill_asset(uuid) to anon, authenticated;
