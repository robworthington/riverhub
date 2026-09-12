-- 0077 — Restore the board RPC's feed-health definition (fix a regression in 0075/0076)
-- =============================================================================
-- 0075 (EA counted spills) recreated public_spills_board from an OUTDATED base and
-- silently reverted two earlier fixes:
--   * 0062 set last_updated = captured_at (OUR poll time). SWW only bumps its own
--     `lastUpdated` when an outlet's status CHANGES, so a healthy monitor that
--     simply hasn't spilled keeps a stale timestamp forever. 0075 reintroduced
--     `coalesce(last_updated, captured_at)`, so quiet-but-healthy monitors (e.g.
--     Darthaven Marina) wrongly showed as "No data" on the board while their own
--     asset page — which kept the captured_at logic — correctly showed them live.
--   * 0072 added last_spill_end (the last >=15-min spill, which drives "recent")
--     and applied the 15-minute floor to the pre-STW day counts. 0075 dropped both.
-- 0076 then added a captured_at column for a "poll time vs data age" board UI —
-- but that was built on the mistaken premise that SWW's timestamp is a data-age
-- signal. It isn't, so that column and UI are being removed.
--
-- This restores public_spills_board to the 0072 definition (captured_at as the
-- freshness field, last_spill_end present, 15-min floor applied) and re-adds only
-- the legitimate 0075 addition: `counted` (EA counted spills).
-- =============================================================================

drop function if exists public_spills_board(int);
create function public_spills_board(p_year int)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry int, wet int, total int, pre_stw int,
  last_spill_end timestamptz,
  counted int
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  latest_snap as (
    select distinct on (asset_id) asset_id, status, status_start, latest_event_start, latest_event_end, captured_at as last_updated
    from edm_snapshots where organisation_id = (select id from org) order by asset_id, captured_at desc
  ),
  ds as (select asset_id, dry, wet, total from dry_spill_summary(1, 0.25, p_year, 15)),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and (p_year is null or (e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)))
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and (p_year is null or (e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)))
  ),
  pre as (select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw from up left join works_days wd on wd.sys = up.sys and wd.day = up.day group by up.asset_id),
  -- the last completed spill that clears the 15-minute floor (drives "recent"); brief blips excluded
  last_real as (
    select e.asset_id, max(e.event_end) as last_spill_end
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and e.event_end is not null and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by e.asset_id
  )
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         ls.status, ls.status_start, ls.latest_event_start, ls.latest_event_end, ls.last_updated,
         coalesce(ds.dry, 0), coalesce(ds.wet, 0), coalesce(ds.total, 0), coalesce(pre.pre_stw, 0),
         lr.last_spill_end,
         case when p_year is null then ea_counted_spills_total(a.id) else ea_counted_spills(a.id, p_year) end
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  left join last_real lr on lr.asset_id = a.id
  where a.organisation_id = (select id from org) and (ls.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;
grant execute on function public_spills_board(int) to anon, authenticated;

-- public_spill_years — same regression class: 0075 based it on 0051 and dropped the 15-minute floor
-- 0056 applied to the "hours spilled" sum, so the asset page's yearly hours picked up sub-15-min blips.
-- Restore the filter; keep the legitimate `counted` column (same shape as live, so no drop needed).
create or replace function public_spill_years(p_asset uuid)
returns table (year int, dry int, wet int, total int, hours int, counted int)
language sql stable security definer set search_path = public as $$
  with y as (select year, dry, wet, unknown from classify_spills_yearly(p_asset)),
  h as (
    select extract(year from event_start)::int yr, round(sum(coalesce(duration_minutes, 0)) / 60.0)::int hours
    from spill_events where asset_id = p_asset and (duration_minutes is null or duration_minutes >= 15) group by 1
  )
  select y.year, y.dry, y.wet, (y.dry + y.wet + y.unknown), coalesce(h.hours, 0),
         ea_counted_spills(p_asset, y.year)
  from y left join h on h.yr = y.year order by y.year;
$$;
grant execute on function public_spill_years(uuid) to anon, authenticated;

-- Return-column shape changed — refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
