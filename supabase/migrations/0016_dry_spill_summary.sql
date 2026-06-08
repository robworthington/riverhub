-- River Hub — per-asset dry-spill summary.
-- With historical events (tens of thousands), classify_spills returns more rows than PostgREST
-- will hand back (>1000), so the dry-spills page can't count from raw rows. This aggregates
-- server-side into one row per asset (always <= asset count), for a given year + window.

create or replace function dry_spill_summary(
  p_window int default 1,
  p_threshold numeric default 0.25,
  p_year int default null
)
returns table (
  asset_id    uuid,
  asset_name  text,
  system_name text,
  dry         int,
  wet         int,
  unknown     int,
  total       int
)
language sql
stable
as $$
  select c.asset_id, c.asset_name, c.system_name,
         count(*) filter (where c.weather_class = 'dry')::int,
         count(*) filter (where c.weather_class = 'wet')::int,
         count(*) filter (where c.weather_class = 'unknown')::int,
         count(*)::int
  from classify_spills(p_window, p_threshold, null, p_year) c
  group by c.asset_id, c.asset_name, c.system_name
  order by count(*) filter (where c.weather_class = 'dry') desc, count(*) desc;
$$;

grant execute on function dry_spill_summary(int, numeric, int) to authenticated;
