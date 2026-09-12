-- 0076 — Expose our poll time (captured_at) alongside SWW's data time (last_updated)
-- =============================================================================
-- The board's freshness has always been read from `last_updated`, which is
-- SOUTH WEST WATER's own timestamp for each reading (see edm/sync.ts: the
-- snapshot's last_updated = the feed's lastUpdated). So when SWW's feed stops
-- advancing that field, the board looks stale even though our hourly sync ran
-- fine and wrote snapshots the whole time — an upstream lag reads as a River
-- Hub outage.
--
-- This adds `captured_at` (the time OUR cron actually polled) to the board RPC,
-- so the UI can show both and tell the two apart: a real pipeline stall
-- (captured_at old) vs an SWW feed lag (captured_at fresh, last_updated old).
-- =============================================================================

-- Return shape changes (adds captured_at) → drop before recreate.
drop function if exists public_spills_board(int);
create or replace function public_spills_board(p_year int)
returns table (
  asset_id           uuid,
  asset_name         text,
  asset_code         text,
  asset_type         text,
  system_id          uuid,
  system_name        text,
  status             int,
  status_start       timestamptz,
  latest_event_start timestamptz,
  latest_event_end   timestamptz,
  last_updated       timestamptz,   -- SWW's reading time (data age)
  captured_at        timestamptz,   -- when our sync last polled this asset (pipeline health)
  dry                int,
  wet                int,
  total              int,
  pre_stw            int,
  counted            int
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  latest_snap as (
    select distinct on (asset_id)
           asset_id, status, status_start, latest_event_start, latest_event_end,
           last_updated, captured_at
    from edm_snapshots
    where organisation_id = (select id from org)
    order by asset_id, captured_at desc
  ),
  ds as (
    select asset_id, dry, wet, total from dry_spill_summary(1, 0.25, p_year)
  ),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e
    join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)
  ),
  pre as (
    select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw
    from up left join works_days wd on wd.sys = up.sys and wd.day = up.day
    group by up.asset_id
  )
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text,
         a.sewage_system_id, sy.name,
         ls.status, ls.status_start, ls.latest_event_start, ls.latest_event_end,
         coalesce(ls.last_updated, ls.captured_at), ls.captured_at,
         coalesce(ds.dry, 0), coalesce(ds.wet, 0), coalesce(ds.total, 0), coalesce(pre.pre_stw, 0),
         case when p_year is null then ea_counted_spills_total(a.id) else ea_counted_spills(a.id, p_year) end
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  where a.organisation_id = (select id from org)
    and (ls.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;
grant execute on function public_spills_board(int) to anon, authenticated;

-- Return-column shape changed — refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
