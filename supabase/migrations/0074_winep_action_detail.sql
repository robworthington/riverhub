-- Richer "what action is required" detail on WINEP measures.
--
-- The official EA PR24 file carries an Action_Categorisation_Type (e.g. "Improve water company
-- intermittent discharges", "Complex investigation involving multiple surveys…", "Improve STW
-- treatment to meet an amended permit limit") and, where the action is tied to a permit, a permit
-- reference — both more specific than the driver code alone. import_winep_bw.py now captures them, so
-- give them a home and surface them through the measures RPCs. (The Rivers Trust mirror the main
-- importer uses doesn't carry these fields, so they populate only for official-file actions.)

alter table winep_actions add column if not exists action_type text;   -- Action_Categorisation_Type
alter table winep_actions add column if not exists permit_ref  text;   -- Licence_Permit_Obstruction_ID

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
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
grant execute on function public_spills_measures() to anon, authenticated;

drop function if exists public_spills_measures_for_asset(uuid);
create function public_spills_measures_for_asset(p_asset uuid)
returns table (id uuid, action_ref text, action_name text, action_description text, driver_code text,
               driver_label text, driver_obligation text, cycle text, completion_date date, complete boolean,
               source text, action_type text, permit_ref text)
language sql stable security definer set search_path = public as $$
  with a as (select id from sewage_assets where id = p_asset and organisation_id = (select public_org()))
  select w.id, w.action_id, w.action_name, w.action_description, w.driver_code, w.driver_label, w.driver_obligation,
    w.cycle, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as complete,
    case when w.asset_id = (select id from a) then 'direct' else 'linked' end as source,
    w.action_type, w.permit_ref
  from winep_actions w
  where w.organisation_id = (select public_org())
    and (w.asset_id = (select id from a)
      or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = (select id from a)))
  order by w.completion_date nulls last, w.cycle desc;
$$;
grant execute on function public_spills_measures_for_asset(uuid) to anon, authenticated;
