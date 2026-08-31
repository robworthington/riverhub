-- Spills regulatory restructure, Phase 3: the public WINEP measures register (/measures).
-- A dedicated RPC (public_winep_actions is left untouched) that adds the reference, the action
-- component, and what each measure is attached to — the direct asset/works name plus a count of the
-- overflows it covers via winep_asset_links. Anon-readable, org-scoped.

create or replace function public_spills_measures()
returns table (
  id uuid, action_ref text, action_component text, cycle text, driver_code text, driver_label text,
  driver_obligation text, action_name text, completion_date date, overdue boolean,
  wb_name text, attached_name text, attached_kind text, attached_count int
)
language sql stable security definer set search_path = public as $$
  with org as (select (select public_org()) as id),
  linkcount as (select winep_action_id, count(*)::int n from winep_asset_links group by winep_action_id)
  select w.id, w.action_id, w.action_component, w.cycle, w.driver_code, w.driver_label,
    w.driver_obligation, w.action_name, w.completion_date,
    (w.completion_date is not null and w.completion_date < current_date) as overdue,
    w.wb_name,
    coalesce(a.asset_name, sy.name) as attached_name,
    case when w.asset_id is not null then 'asset'
         when w.sewage_system_id is not null then 'works'
         when w.wb_name is not null then 'waterbody' else 'none' end as attached_kind,
    (coalesce(lc.n, 0) + case when w.asset_id is not null then 1 else 0 end) as attached_count
  from winep_actions w
  left join sewage_assets a on a.id = w.asset_id
  left join sewage_systems sy on sy.id = w.sewage_system_id
  left join linkcount lc on lc.winep_action_id = w.id
  where w.organisation_id = (select id from org)
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
grant execute on function public_spills_measures() to anon, authenticated;
