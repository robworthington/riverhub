-- River Hub — optional minimum-duration filter for dry-spill views (DRY-SPILL-UX-PROPOSAL.md A).
-- A spill recorded as a single monitor interval (~15 min) is the least precise, most disputable
-- unit. This adds a p_min_minutes display filter to the dry-spill aggregates (NOT a recount — the
-- EA 12/24h counts stay canonical elsewhere). Ongoing spills (null duration) are always kept.
-- classify_spills is unchanged (it already returns duration_minutes; per-event UIs filter on it).

drop function if exists public_dry_spills(int);
drop function if exists dry_spill_summary(int, numeric, int);

create or replace function dry_spill_summary(
  p_window int default 1,
  p_threshold numeric default 0.25,
  p_year int default null,
  p_min_minutes int default 0
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
  where p_min_minutes <= 0 or c.duration_minutes is null or c.duration_minutes >= p_min_minutes
  group by c.asset_id, c.asset_name, c.system_name
  order by count(*) filter (where c.weather_class = 'dry') desc, count(*) desc;
$$;

grant execute on function dry_spill_summary(int, numeric, int, int) to authenticated;

-- public wrapper (anon): adds the same optional filter
create or replace function public_dry_spills(p_year int, p_min_minutes int default 0)
returns table (asset_id uuid, asset_name text, system_name text, dry int, wet int, unknown int, total int)
language sql stable security definer set search_path = public as $$
  select * from dry_spill_summary(1, 0.25, p_year, p_min_minutes);
$$;

grant execute on function public_dry_spills(int, int) to anon, authenticated;

notify pgrst, 'reload schema';
