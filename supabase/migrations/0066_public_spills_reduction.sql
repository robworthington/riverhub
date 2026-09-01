-- Overflow Reduction Tracker (SODRP has no per-asset target or progress, so we build one from EDM).
-- Per overflow: spills/year against its 2020 baseline and the plan's ~10 spills/year cap, with the
-- category deadline its location implies (bathing 2035 / high-priority nature 2045 / else 2050).
-- Anon-readable, org-scoped, ISR-cached.

create or replace function public_spills_reduction()
returns table (
  asset_id uuid, asset_name text, asset_code text, system_name text,
  baseline_year int, baseline int, latest_year int, latest int, pct_change int, x_cap numeric,
  deadline text, verdict text, series jsonb
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  lfy as (select public_spills_latest_full_year() as y),
  py as (
    select e.asset_id, extract(year from e.event_start)::int as yr,
      count(*) filter (where e.duration_minutes is null or e.duration_minutes >= 15)::int as n
    from spill_events e where e.organisation_id = (select id from org)
    group by e.asset_id, extract(year from e.event_start)::int
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
      coalesce((select n from py where py.asset_id = a.asset_id and yr = (select y from lfy)), 0) as latest
    from agg a
  ),
  sodrp as (
    select sa.id as asset_id,
      case
        when bool_or(pa.designation = 'bathing_water' and ST_Distance(g.geog, pa.geom::geography)
             <= (case when (pa.attrs->>'water_type') = 'inland' then 5000 else 1000 end)) then '2035'
        when bool_or(pa.designation <> 'bathing_water' and ST_Distance(g.geog, pa.geom::geography) <= 1000) then '2045'
        else '2050' end as deadline
    from sewage_assets sa
    cross join lateral (select ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography as geog) g
    left join protected_areas pa on pa.organisation_id = sa.organisation_id and pa.sodrp_high_priority
      and ST_DWithin(g.geog, pa.geom::geography, 5000)
    where sa.organisation_id = (select id from org) and sa.latitude is not null and sa.longitude is not null
    group by sa.id
  )
  select bl.asset_id, sa.asset_name, sa.asset_unique_id, sy.name,
    bl.baseline_year, bl.baseline, bl.latest_year, bl.latest,
    case when bl.baseline > 0 then round((bl.latest - bl.baseline)::numeric / bl.baseline * 100)::int end as pct_change,
    round(bl.latest / 10.0, 1) as x_cap,
    coalesce(so.deadline, '2050') as deadline,
    case when bl.latest <= 10 then 'within'
         when bl.baseline is not null and bl.latest > bl.baseline then 'rising'
         else 'falling' end as verdict,
    bl.series
  from base_latest bl
  join sewage_assets sa on sa.id = bl.asset_id
  left join sewage_systems sy on sy.id = sa.sewage_system_id
  left join sodrp so on so.asset_id = bl.asset_id
  where bl.baseline is not null or bl.latest > 0
  order by bl.latest desc, x_cap desc;
$$;
grant execute on function public_spills_reduction() to anon, authenticated;
