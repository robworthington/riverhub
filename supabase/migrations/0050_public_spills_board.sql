-- Public spills board (PUBLIC-SITE-REDESIGN.md, Phase 1). One row per tracked overflow asset with:
-- live status (latest snapshot), feed freshness (last_updated), period dry/wet/total (our 0.25 mm
-- method via dry_spill_summary), and the pre-STW count (upstream overflow spilled on a day its works
-- did not) generalised org-wide from spills_ahead_of_works. Anon-readable via the public portal.

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
  pre_stw            int
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
         coalesce(ds.dry, 0), coalesce(ds.wet, 0), coalesce(ds.total, 0), coalesce(pre.pre_stw, 0)
  from sewage_assets a
  left join sewage_systems sy on sy.id = a.sewage_system_id
  left join latest_snap ls on ls.asset_id = a.id
  left join ds on ds.asset_id = a.id
  left join pre on pre.asset_id = a.id
  where a.organisation_id = (select id from org)
    and (ls.asset_id is not null or ds.asset_id is not null)   -- tracked = has a live feed or spill history
  order by a.asset_name;
$$;

grant execute on function public_spills_board(int) to anon, authenticated;
