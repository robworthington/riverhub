-- Live "spilled recently" status should honour the same 15-minute floor as the rest of the site.
--
-- The board/map/asset live status derived "recent" (stopped in the last 48h) from the snapshot's
-- latest_event_end — SWW's raw last-event timestamp, which includes sub-15-minute blips. Every other
-- public figure (chart, hours, dry/pre-STW flags, year totals, map counts) excludes spills under 15
-- minutes (see 0056), and the site tells readers so. So an outlet whose only recent activity is a
-- 3-minute blip showed a "spilled recently" badge over an empty chart — the badge was the one place
-- breaking the 15-minute rule.
--
-- Expose last_spill_end: the end of the most recent COMPLETED spill that clears the 15-minute floor
-- (null-duration / ongoing events are kept, matching the main-view rule in 0056). derive() uses this
-- for the recency test instead of latest_event_end, so a run of brief blips no longer lights the badge.
-- "Spilling now" (status = 1) is unchanged — in real time a spill's duration is not yet known.
--
-- Return signatures gain a column, so these are drop+recreate rather than create-or-replace.

drop function if exists public_spills_board(int);
create function public_spills_board(p_year int)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry int, wet int, total int, pre_stw int,
  last_spill_end timestamptz
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
         lr.last_spill_end
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

drop function if exists public_spill_asset(uuid);
create function public_spill_asset(p_asset uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry_all int, total_all int, pre_stw_all int, first_year int,
  last_spill_end timestamptz
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
              and (e.duration_minutes is null or e.duration_minutes >= 15)) as last_spill_end
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join snap s on true cross join y cross join pre
  where a.id = p_asset and a.organisation_id = (select public_org());
$$;
grant execute on function public_spill_asset(uuid) to anon, authenticated;

drop function if exists public_spill_pins();
create function public_spill_pins()
returns table (
  asset_id uuid, asset_name text, lat double precision, lng double precision,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  last_spill_end timestamptz
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  snap as (
    select distinct on (asset_id)
           asset_id, status, status_start, latest_event_start, latest_event_end, coalesce(last_updated, captured_at) lu
    from edm_snapshots where organisation_id = (select id from org)
    order by asset_id, captured_at desc
  ),
  last_real as (
    select e.asset_id, max(e.event_end) as last_spill_end
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and e.event_end is not null and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by e.asset_id
  )
  select a.id, a.asset_name, a.latitude, a.longitude,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu,
         lr.last_spill_end
  from sewage_assets a
  join snap s on s.asset_id = a.id
  left join last_real lr on lr.asset_id = a.id
  where a.organisation_id = (select id from org)
    and a.latitude is not null and a.longitude is not null;
$$;
grant execute on function public_spill_pins() to anon, authenticated;
