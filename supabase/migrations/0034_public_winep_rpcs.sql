-- River Hub — public-portal WINEP data layer. WINEP is public regulatory data (no PII), exposed via
-- anon-granted SECURITY DEFINER functions over the single-org public_org() slice, mirroring the
-- other public_* RPCs (0030). Members read winep_actions directly under RLS; these are for the
-- public portal only.

-- All catchment WINEP actions, curated for public display (drives the improvements page + table).
create or replace function public_winep_actions()
returns table (
  id uuid, cycle text, driver_code text, driver_label text, driver_obligation text,
  action_name text, action_description text, completion_date date, overdue boolean,
  ea_water_body_id text, wb_name text, has_asset boolean, has_works boolean,
  proposed_permit_dwf text, proposed_bod text, proposed_nh3 text, proposed_p text,
  bathing_water text, shellfish_water text
)
language sql stable security definer set search_path = public as $$
  select w.id, w.cycle, w.driver_code, w.driver_label, w.driver_obligation,
         w.action_name, w.action_description, w.completion_date,
         (w.completion_date is not null and w.completion_date < current_date) as overdue,
         w.ea_water_body_id, w.wb_name,
         (w.asset_id is not null) as has_asset, (w.sewage_system_id is not null) as has_works,
         w.proposed_permit_dwf, w.proposed_bod, w.proposed_nh3, w.proposed_p,
         w.bathing_water, w.shellfish_water
  from winep_actions w
  where w.organisation_id = public_org()
  order by w.completion_date nulls last, w.cycle desc, w.action_name;
$$;
grant execute on function public_winep_actions() to anon, authenticated;

-- Catchment summary: counts by cycle × obligation theme, storm-overflow count, next deadline.
create or replace function public_winep_summary()
returns table (cycle text, driver_obligation text, n int, n_storm_overflow int,
               n_overdue int, next_deadline date)
language sql stable security definer set search_path = public as $$
  select w.cycle, coalesce(w.driver_obligation, 'Other') as driver_obligation,
         count(*)::int as n,
         count(*) filter (where w.driver_code ilike 'U\_IMP%' escape '\'
                             or w.driver_code ilike 'EnvAct%')::int as n_storm_overflow,
         count(*) filter (where w.completion_date is not null
                             and w.completion_date < current_date)::int as n_overdue,
         min(w.completion_date) filter (where w.completion_date >= current_date) as next_deadline
  from winep_actions w
  where w.organisation_id = public_org()
  group by w.cycle, coalesce(w.driver_obligation, 'Other')
  order by w.cycle desc, n desc;
$$;
grant execute on function public_winep_summary() to anon, authenticated;

-- Actions relevant to one asset: linked directly, via its works (sewage_system), or its water body.
-- link_kind tells the UI how strong the link is (asset > works > waterbody).
create or replace function public_winep_for_asset(p_asset_id uuid)
returns table (
  id uuid, cycle text, driver_code text, driver_label text, driver_obligation text,
  action_name text, action_description text, completion_date date, overdue boolean, link_kind text,
  proposed_permit_dwf text, proposed_bod text, proposed_nh3 text, proposed_p text,
  bathing_water text, shellfish_water text, wb_name text
)
language sql stable security definer set search_path = public as $$
  with a as (
    select id, sewage_system_id, water_body_id from sewage_assets
    where id = p_asset_id and organisation_id = public_org()
  )
  select w.id, w.cycle, w.driver_code, w.driver_label, w.driver_obligation,
         w.action_name, w.action_description, w.completion_date,
         (w.completion_date is not null and w.completion_date < current_date) as overdue,
         case when w.asset_id = a.id then 'asset'
              when a.sewage_system_id is not null and w.sewage_system_id = a.sewage_system_id then 'works'
              else 'waterbody' end as link_kind,
         w.proposed_permit_dwf, w.proposed_bod, w.proposed_nh3, w.proposed_p,
         w.bathing_water, w.shellfish_water, w.wb_name
  from winep_actions w cross join a
  where w.organisation_id = public_org()
    and (w.asset_id = a.id
      or (a.sewage_system_id is not null and w.sewage_system_id = a.sewage_system_id)
      or (a.water_body_id is not null and w.water_body_id = a.water_body_id))
  order by (case when w.asset_id = a.id then 0
                 when w.sewage_system_id = a.sewage_system_id then 1 else 2 end),
           w.completion_date nulls last, w.cycle desc;
$$;
grant execute on function public_winep_for_asset(uuid) to anon, authenticated;
