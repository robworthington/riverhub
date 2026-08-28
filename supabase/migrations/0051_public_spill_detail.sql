-- Public spill asset-detail RPCs (PUBLIC-SITE-REDESIGN.md, Phase 2). Thin anon-readable wrappers over
-- the proven classify_spills / classify_spills_yearly functions, plus the org-wide pre-STW logic.

-- Header: asset meta + live status + since-2020 totals for /explore/spills/[assetId].
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
  y as (
    select coalesce(sum(dry), 0)::int dry, coalesce(sum(dry + wet + unknown), 0)::int total, min(year) fy
    from classify_spills_yearly(p_asset)
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank') group by 1
  ),
  up as (select e.event_start::date as day from spill_events e where e.asset_id = p_asset),
  pre as (select count(*) filter (where wd.day is null)::int n from up left join wd on wd.day = up.day)
  select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text, a.sewage_system_id, sy.name,
         s.status, s.status_start, s.latest_event_start, s.latest_event_end, s.lu,
         y.dry, y.total, pre.n, y.fy
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join snap s on true
  cross join y cross join pre
  where a.id = p_asset and a.organisation_id = (select public_org());
$$;

-- Per-year dry/wet/total + hours, for the since-2020 bar chart + year picker.
create or replace function public_spill_years(p_asset uuid)
returns table (year int, dry int, wet int, total int, hours int)
language sql stable security definer set search_path = public as $$
  with y as (select year, dry, wet, unknown from classify_spills_yearly(p_asset)),
  h as (
    select extract(year from event_start)::int yr, round(sum(coalesce(duration_minutes, 0)) / 60.0)::int hours
    from spill_events where asset_id = p_asset group by 1
  )
  select y.year, y.dry, y.wet, (y.dry + y.wet + y.unknown), coalesce(h.hours, 0)
  from y left join h on h.yr = y.year order by y.year;
$$;

-- Every event in a year, classified, with the "works also spilling that day" flag for the pre-STW note.
create or replace function public_spill_events(p_asset uuid, p_year int)
returns table (event_start timestamptz, event_end timestamptz, duration_minutes int, weather_class text, max_rain numeric, stw_also boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, p_year)
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank')
      and extract(year from e.event_start) = p_year group by 1
  )
  select ev.event_start, ev.event_end, ev.duration_minutes, ev.weather_class, ev.max_rain,
         (ev.event_start::date in (select day from wd)) as stw_also
  from ev order by ev.event_start desc;
$$;

-- Flagged events across the whole record: dry spills, and spills that started when the works stayed shut.
create or replace function public_spill_flagged(p_asset uuid)
returns table (kind text, event_start timestamptz, event_end timestamptz, duration_minutes int, max_rain numeric)
language sql stable security definer set search_path = public as $$
  with cl as (
    select event_start, event_end, duration_minutes, weather_class, max_rain
    from classify_spills(1, 0.25, p_asset, null)
  ),
  wd as (
    select e.event_start::date as day from spill_events e join sewage_assets w on w.id = e.asset_id
    where w.sewage_system_id = (select sewage_system_id from sewage_assets where id = p_asset)
      and w.asset_type in ('sewage_treatment_works', 'storm_tank') group by 1
  )
  select 'dry'::text, event_start, event_end, duration_minutes, max_rain from cl where weather_class = 'dry'
  union all
  select 'prestw'::text, event_start, event_end, duration_minutes, max_rain
  from cl where event_start::date not in (select day from wd)
  order by 2 desc;
$$;

grant execute on function public_spill_asset(uuid)   to anon, authenticated;
grant execute on function public_spill_years(uuid)   to anon, authenticated;
grant execute on function public_spill_events(uuid, int) to anon, authenticated;
grant execute on function public_spill_flagged(uuid) to anon, authenticated;
