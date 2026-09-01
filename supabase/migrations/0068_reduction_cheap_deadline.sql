-- public_spills_reduction() did a PostGIS geography proximity join per asset to derive the SODRP
-- deadline, which is too slow across the whole catchment for the anon/build path (the page prerendered
-- empty even with a geography index). Derive the deadline from the asset's already-stored bathing/
-- shellfish-water association instead — no spatial join, so the RPC is as fast as the other aggregates.
-- bathing water -> 2035; shellfish (high-priority nature) -> 2045; otherwise the 2050 catch-all.
-- Indicative, and slightly less complete than the full proximity (it won't catch SSSI/SAC-only
-- adjacency), which the page already flags as not an official per-overflow determination.

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
  )
  select bl.asset_id, sa.asset_name, sa.asset_unique_id, sy.name,
    bl.baseline_year, bl.baseline, bl.latest_year, bl.latest,
    case when bl.baseline > 0 then round((bl.latest - bl.baseline)::numeric / bl.baseline * 100)::int end as pct_change,
    round(bl.latest / 10.0, 1) as x_cap,
    case when sa.bathing_water is not null then '2035'
         when sa.shellfish_water is not null then '2045'
         else '2050' end as deadline,
    case when bl.latest <= 10 then 'within'
         when bl.baseline is not null and bl.latest > bl.baseline then 'rising'
         else 'falling' end as verdict,
    bl.series
  from base_latest bl
  join sewage_assets sa on sa.id = bl.asset_id
  left join sewage_systems sy on sy.id = sa.sewage_system_id
  where bl.baseline is not null or bl.latest > 0
  order by bl.latest desc, x_cap desc;
$$;
grant execute on function public_spills_reduction() to anon, authenticated;
