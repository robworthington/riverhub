-- 0075 — Bring in the Environment Agency's counted-spills method (12/24-hour block rule)
-- =============================================================================
-- River Hub has always counted DISCHARGE EVENTS: every discrete monitor
-- discharge (>= 15 min). The regulator instead reports COUNTED SPILLS using the
-- EDM "12/24-hour block" rule: the first 12 hours of a block of discharging is
-- one spill, then each further 24-hour block that contains any discharge adds
-- one more; a block ends after a 24-hour block with no discharge. That figure
-- is the unit for the Storm Overflows Discharge Reduction Plan's "10 spills a
-- year" cap and for Ofwat's performance commitments — so a fair comparison to
-- the cap has to be on the EA basis, not on granular events (which run ~10x
-- higher for short, frequent spillers).
--
-- This migration:
--   (a) counted_spills_12_24(asset, year)  — ports the EA block rule
--   (b) ea_counted_spills(asset, year)     — published EA return where we have
--       it (edm_annual_stats), else the computed 12/24 figure (current year,
--       or any gap in the published record)
--   (c) recreates public_spills_reduction  — the accuracy fix: latest / baseline
--       / vs-cap / verdict now measured against the EA counted figure, which is
--       what the 10/year cap actually refers to. Adds latest_events (granular)
--       so the UI can show both.
--   (d) recreates public_spills_board       — adds `counted` alongside total
--   (e) recreates public_spill_years        — adds `counted` per year
-- =============================================================================

-- (a) The EA 12/24-hour block rule ------------------------------------------
-- Uses ALL discharges in the year (a null end is treated as start + 15 min, as
-- the monitor's shortest interval), which is what the EA method does — the
-- >= 15-min filter we apply to event counts is not applied here. Validated
-- against the 2025 EDM workbook: Totnes STW (SBB01264) = 123, Kilbury STW
-- (SBB00178) = 90, both exact matches to the published return.
create or replace function counted_spills_12_24(p_asset uuid, p_year int)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  s timestamptz; e timestamptz;
  ms timestamptz[] := '{}';   -- merged interval starts (ascending, non-overlapping)
  me timestamptz[] := '{}';   -- merged interval ends
  cur_s timestamptz; cur_e timestamptz;
  have_cur boolean := false;
  cnt int := 0;
  i int; n int; j int;
  window_end timestamptz; win_hi timestamptz; hit boolean;
begin
  -- Merge overlapping/touching discharges into blocks, ordered by start.
  for s, e in
    select event_start,
           coalesce(event_end, event_start + interval '15 minutes')
    from spill_events
    where asset_id = p_asset
      and event_start >= make_date(p_year, 1, 1)
      and event_start <  make_date(p_year + 1, 1, 1)
    order by event_start
  loop
    if not have_cur then
      cur_s := s; cur_e := e; have_cur := true;
    elsif s <= cur_e then
      if e > cur_e then cur_e := e; end if;
    else
      ms := array_append(ms, cur_s); me := array_append(me, cur_e);
      cur_s := s; cur_e := e;
    end if;
  end loop;
  if have_cur then
    ms := array_append(ms, cur_s); me := array_append(me, cur_e);
  end if;

  n := coalesce(array_length(ms, 1), 0);
  if n = 0 then return 0; end if;

  -- Walk the merged blocks applying the 12h-then-24h counting rule.
  i := 1;
  while i <= n loop
    cnt := cnt + 1;                                -- first 12h of a fresh block = 1 spill
    window_end := ms[i] + interval '12 hours';
    loop
      win_hi := window_end + interval '24 hours';
      hit := false; j := i;
      while j <= n and ms[j] < win_hi loop
        if me[j] > window_end then hit := true; exit; end if;
        j := j + 1;
      end loop;
      if hit then
        cnt := cnt + 1;                            -- another 24h block with discharge = +1
        window_end := win_hi;
      else
        exit;                                      -- 24h clear → block closed
      end if;
    end loop;
    while i <= n and ms[i] < window_end loop        -- skip everything inside the closed block
      i := i + 1;
    end loop;
  end loop;

  return least(cnt, 366);                          -- a year cannot hold more than 366 daily blocks
end;
$$;
grant execute on function counted_spills_12_24(uuid, int) to anon, authenticated;

-- (b) Prefer the published EA return; fall back to the computed figure --------
-- Completed years carry the water company's published annual return in
-- edm_annual_stats (the authoritative number). The current year, and any year
-- with no published row, use the computed 12/24 figure so the series is always
-- complete and always on the EA basis.
create or replace function ea_counted_spills(p_asset uuid, p_year int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select round(sum(spill_count))::int
       from edm_annual_stats
      where asset_id = p_asset and year = p_year
      having sum(spill_count) is not null),
    counted_spills_12_24(p_asset, p_year)
  );
$$;
grant execute on function ea_counted_spills(uuid, int) to anon, authenticated;

-- Counted spills across every year on record (for the board's "All years" view).
create or replace function ea_counted_spills_total(p_asset uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(ea_counted_spills(p_asset, yr)), 0)::int
  from (
    select distinct extract(year from event_start)::int as yr
    from spill_events where asset_id = p_asset
  ) ys;
$$;
grant execute on function ea_counted_spills_total(uuid) to anon, authenticated;

-- (c) Reduction tracker on the EA counted basis (the accuracy fix) ------------
-- Previously this compared the granular event count to the 10/year cap, which
-- overstated the gap ~10x for short-frequent spillers. Now latest / baseline /
-- vs-cap / verdict and the trajectory are all EA counted spills — the figure
-- the cap is actually written in. latest_events keeps the granular figure for
-- context alongside.
-- (drop first: the return shape changed — added latest_events)
drop function if exists public_spills_reduction();
create or replace function public_spills_reduction()
returns table (
  asset_id uuid, asset_name text, asset_code text, system_name text,
  baseline_year int, baseline int, latest_year int, latest int, latest_events int,
  pct_change int, x_cap numeric, deadline text, verdict text, series jsonb
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select public_spills_latest_full_year() as y),
  -- every (asset, year) the org has any discharge history for, on the EA basis
  ay as (
    select distinct asset_id, extract(year from event_start)::int as yr
    from spill_events where organisation_id = (select id from org)
  ),
  py as (
    select ay.asset_id, ay.yr, ea_counted_spills(ay.asset_id, ay.yr) as n
    from ay
  ),
  -- granular event count (>= 15 min) for the secondary "discharge events" figure
  ev as (
    select asset_id, extract(year from event_start)::int as yr,
      count(*) filter (where duration_minutes is null or duration_minutes >= 15)::int as n
    from spill_events where organisation_id = (select id from org)
    group by 1, 2
  ),
  agg as (
    select asset_id,
      jsonb_agg(jsonb_build_object('year', yr, 'count', n) order by yr) as series,
      min(yr) as first_yr,
      (array_agg(n order by yr))[1] as first_n
    from py where yr <= (select y from lfy) group by asset_id
  ),
  base_latest as (
    select a.asset_id, a.series,
      case when exists (select 1 from py where py.asset_id = a.asset_id and yr = 2020) then 2020 else a.first_yr end as baseline_year,
      coalesce((select n from py where py.asset_id = a.asset_id and yr = 2020), a.first_n) as baseline,
      (select y from lfy) as latest_year,
      coalesce((select n from py where py.asset_id = a.asset_id and yr = (select y from lfy)), 0) as latest,
      coalesce((select n from ev where ev.asset_id = a.asset_id and yr = (select y from lfy)), 0) as latest_events
    from agg a
  )
  select bl.asset_id, sa.asset_name, sa.asset_unique_id, sy.name,
    bl.baseline_year, bl.baseline, bl.latest_year, bl.latest, bl.latest_events,
    case when bl.baseline > 0 then round((bl.latest - bl.baseline)::numeric / bl.baseline * 100)::int end as pct_change,
    round(bl.latest / 10.0, 1) as x_cap,
    coalesce(sa.sodrp_deadline, '2050') as deadline,
    case when bl.latest <= 10 then 'within'
         when bl.baseline is not null and bl.latest > bl.baseline then 'rising' else 'falling' end as verdict,
    bl.series
  from base_latest bl
  join sewage_assets sa on sa.id = bl.asset_id
  left join sewage_systems sy on sy.id = sa.sewage_system_id
  where bl.baseline is not null or bl.latest > 0
  order by bl.latest desc, x_cap desc;
$$;
grant execute on function public_spills_reduction() to anon, authenticated;

-- (d) Board — add EA counted spills alongside the granular total --------------
-- (drop first: the return shape changed — added `counted`)
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
  last_updated       timestamptz,
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
           coalesce(last_updated, captured_at) as last_updated
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
         ls.status, ls.status_start, ls.latest_event_start, ls.latest_event_end, ls.last_updated,
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

-- (e) Per-year detail — add EA counted spills per year ------------------------
-- (drop first: the return shape changed — added `counted`)
drop function if exists public_spill_years(uuid);
create or replace function public_spill_years(p_asset uuid)
returns table (year int, dry int, wet int, total int, hours int, counted int)
language sql stable security definer set search_path = public as $$
  with y as (select year, dry, wet, unknown from classify_spills_yearly(p_asset)),
  h as (
    select extract(year from event_start)::int yr, round(sum(coalesce(duration_minutes, 0)) / 60.0)::int hours
    from spill_events where asset_id = p_asset group by 1
  )
  select y.year, y.dry, y.wet, (y.dry + y.wet + y.unknown), coalesce(h.hours, 0),
         ea_counted_spills(p_asset, y.year)
  from y left join h on h.yr = y.year order by y.year;
$$;
grant execute on function public_spill_years(uuid) to anon, authenticated;

-- Return-column shapes changed — refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
