-- Keep the PUBLIC measures register to measures actually attributed to the catchment.
--
-- The WINEP importer now also stages in-scope-but-unlinked actions (names a works we hold, or within
-- 2 km of one of our outlets) as UNLINKED winep_actions rows, so an editor can attach them to the
-- right outlet in the admin AssetMeasuresManager picker. Those rows must NOT appear on the public
-- measures register until they are linked — they are an editorial queue, and a near-boundary 2 km
-- candidate could otherwise show publicly as a catchment measure it isn't.
--
-- A measure is "attributed" when it resolves to our data: a water body / works / outlet we hold, or a
-- manual winep_asset_links row. public_spills_measures_for_asset (0074) and the problems/has_action
-- RPCs already require a link, so only the all-catchment register needs this filter.

drop function if exists public_spills_measures();
create function public_spills_measures()
returns table (
  id uuid, action_ref text, action_component text, cycle text, driver_code text, driver_label text,
  driver_obligation text, action_name text, action_description text, completion_date date, complete boolean,
  wb_name text, attached_name text, attached_kind text, attached_count int,
  action_type text, permit_ref text
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  linkcount as (select winep_action_id, count(*)::int n from winep_asset_links group by winep_action_id)
  select w.id, w.action_id, w.action_component, w.cycle, w.driver_code, w.driver_label,
    w.driver_obligation, w.action_name, w.action_description, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    w.wb_name,
    coalesce(a.asset_name, sy.name) as attached_name,
    case when w.asset_id is not null then 'asset'
         when w.sewage_system_id is not null then 'works'
         when w.wb_name is not null then 'waterbody' else 'none' end as attached_kind,
    (coalesce(lc.n, 0) + case when w.asset_id is not null then 1 else 0 end) as attached_count,
    w.action_type, w.permit_ref
  from winep_actions w
  left join sewage_assets a on a.id = w.asset_id
  left join sewage_systems sy on sy.id = w.sewage_system_id
  left join linkcount lc on lc.winep_action_id = w.id
  where w.organisation_id = (select id from org)
    -- attributed only: resolves to our water body / works / outlet, or a manual link. Excludes the
    -- unlinked candidates staged for editorial linking.
    and (w.water_body_id is not null or w.sewage_system_id is not null or w.asset_id is not null
         or lc.n is not null)
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
grant execute on function public_spills_measures() to anon, authenticated;

notify pgrst, 'reload schema';
