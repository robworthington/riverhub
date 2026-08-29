-- Exclude sub-15-minute spills from the public spill counts (PUBLIC-SITE-REDESIGN.md). The design and
-- the members dry-spills default both drop spills < 15 min (single-interval monitor blips); the public
-- RPCs were counting them, inflating dry/total/hours. Apply the same minimum everywhere we count
-- events. A null duration (ongoing) is kept, matching dry_spill_summary's own rule.

-- classify_spills_yearly (per-asset year totals; used by the public detail AND the members spill-trend
-- chart) — exclude short events so both match the dry-spills default.
create or replace function classify_spills_yearly(p_asset uuid, p_window int default 1, p_threshold numeric default 0.25)
returns table (year int, dry int, wet int, unknown int)
language sql stable as $$
  with ev as (
    select extract(year from e.event_start)::int as yr, a.rainfall_station_id as sid, e.event_start::date as d
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where e.asset_id = p_asset and (e.duration_minutes is null or e.duration_minutes >= 15)
  ), cls as (
    select ev.yr,
      case
        when (select bool_or(coalesce(r.rainfall_mm, 0) > p_threshold) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) then 'wet'
        when (select count(distinct r.reading_date) from rainfall_readings r
              where r.station_id = ev.sid and r.reading_date between ev.d - p_window and ev.d) = p_window + 1 then 'dry'
        else 'unknown'
      end as wc
    from ev
  )
  select yr, count(*) filter (where wc = 'dry')::int, count(*) filter (where wc = 'wet')::int, count(*) filter (where wc = 'unknown')::int
  from cls group by yr order by yr;
$$;

-- Board: dry/wet/total via dry_spill_summary with the 15-min minimum; pre-STW over >=15-min events.
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
    select distinct on (asset_id) asset_id, status, status_start, latest_event_start, latest_event_end, coalesce(last_updated, captured_at) as last_updated
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

-- League: hours + dry + pre-STW, all over >=15-min events.
create or replace function public_spills_league(p_year int)
returns table (asset_id uuid, asset_name text, asset_code text, hours int, dry int, pre_stw int)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  hrs as (
    select e.asset_id, round(sum(coalesce(e.duration_minutes, 0)) / 60.0)::int hours
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org)
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and (p_year is null or (e.event_start >= make_date(p_year, 1, 1) and e.event_start < make_date(p_year + 1, 1, 1)))
    group by e.asset_id
  ),
  ds as (select asset_id, dry from dry_spill_summary(1, 0.25, p_year, 15)),
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
  select a.id, a.asset_name, a.asset_unique_id, coalesce(hrs.hours, 0), coalesce(ds.dry, 0), coalesce(pre.pre_stw, 0)
  from sewage_assets a
  left join hrs on hrs.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  where a.organisation_id = (select id from org) and (hrs.asset_id is not null or ds.asset_id is not null)
  order by a.asset_name;
$$;

-- Detail: per-year hours, per-event log, flagged tables — all over >=15-min events.
create or replace function public_spill_years(p_asset uuid)
returns table (year int, dry int, wet int, total int, hours int)
language sql stable security definer set search_path = public as $$
  with y as (select year, dry, wet, unknown from classify_spills_yearly(p_asset)),
  h as (
    select extract(year from event_start)::int yr, round(sum(coalesce(duration_minutes, 0)) / 60.0)::int hours
    from spill_events where asset_id = p_asset and (duration_minutes is null or duration_minutes >= 15) group by 1
  )
  select y.year, y.dry, y.wet, (y.dry + y.wet + y.unknown), coalesce(h.hours, 0)
  from y left join h on h.yr = y.year order by y.year;
$$;

create or replace function public_spill_events(p_asset uuid, p_year int)
returns table (event_start timestamptz, event_end timestamptz, duration_minutes int, weather_class text, max_rain numeric, stw_also boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, p_year)
    where duration_minutes is null or duration_minutes >= 15
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
      and extract(year from e.event_start) = p_year group by 1
  )
  select ev.event_start, ev.event_end, ev.duration_minutes, ev.weather_class, ev.max_rain,
         (ev.event_start::date in (select day from wd)) as stw_also
  from ev order by ev.event_start desc;
$$;

create or replace function public_spill_flagged(p_asset uuid)
returns table (kind text, event_start timestamptz, event_end timestamptz, duration_minutes int, max_rain numeric)
language sql stable security definer set search_path = public as $$
  with cl as (
    select event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, null)
    where duration_minutes is null or duration_minutes >= 15
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15) group by 1
  )
  select 'dry'::text, event_start, event_end, duration_minutes, max_rain from cl where weather_class = 'dry'
  union all
  select 'prestw'::text, event_start, event_end, duration_minutes, max_rain from cl where event_start::date not in (select day from wd)
  order by 2 desc;
$$;

-- Detail header: pre-STW over >=15-min events (dry_all/total_all already come via the filtered
-- classify_spills_yearly above).
create or replace function public_spill_asset(p_asset uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text,
  system_id uuid, system_name text,
  status int, status_start timestamptz, latest_event_start timestamptz, latest_event_end timestamptz, last_updated timestamptz,
  dry_all int, total_all int, pre_stw_all int, first_year int
)
language sql stable security definer set search_path = public as $$
  with snap as (
    select status, status_start, latest_event_start, latest_event_end, coalesce(last_updated, captured_at) lu
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
