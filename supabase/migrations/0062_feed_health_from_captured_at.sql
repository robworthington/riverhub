-- Feed health should track OUR poll time, not SWW's own timestamp.
-- SWW's feed only bumps `lastUpdated` when an outlet's status CHANGES, so a healthy monitor that
-- simply hasn't spilled keeps a stale lastUpdated forever — which made the board flag working feeds
-- as "quiet" and forced their live status to "unknown". `captured_at` (when our hourly sync last
-- fetched the outlet) goes stale precisely when SWW stops serving the outlet or the sync stops, which
-- is what "is the feed working?" actually means. Swap the feed-freshness field to captured_at in the
-- board and the asset header. Same signatures — plain create-or-replace.

create or replace function public_spills_board(p_year int)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry int, wet int, total int, pre_stw int
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
  pre as (select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw from up left join works_days wd on wd.sys = up.sys and wd.day = up.day group by up.asset_id)
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         ls.status, ls.status_start, ls.latest_event_start, ls.latest_event_end, ls.last_updated,
         coalesce(ds.dry, 0), coalesce(ds.wet, 0), coalesce(ds.total, 0), coalesce(pre.pre_stw, 0)
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  where a.organisation_id = (select id from org) and (ls.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;

create or replace function public_spill_asset(p_asset uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry_all int, total_all int, pre_stw_all int, first_year int
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
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu, y.dry, y.total, pre.n, y.fy
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join snap s on true cross join y cross join pre
  where a.id = p_asset and a.organisation_id = (select public_org());
$$;
