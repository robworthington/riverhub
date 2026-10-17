-- Extend the awaiting-linking worklist with a bathing/shellfish-water suggestion.
--
-- Some WINEP bathing-water improvements are ungeocoded AND named in the WINEP convention
-- (FORE STREET_CSO_TOTNES) rather than our human labels (31 Fore Street, Totnes), so neither the
-- works-segment name match nor outlet proximity can place them. But the action carries a designated
-- bathing/shellfish water that one of our assets is tagged to — a precise catchment tie. The loader
-- now stages these as unlinked candidates (matches_bw); suggest an outlet sharing that bathing water
-- so an editor can attach it in one click (and correct to the exact outlet if needed).

create or replace function measures_awaiting_linking()
returns table (
  id uuid, action_ref text, action_component text, action_name text, driver_code text,
  driver_label text, driver_obligation text, completion_date date, overdue boolean,
  suggested_asset_id uuid, suggested_asset_name text, match_kind text
)
language sql stable security definer set search_path = public as $$
  with org as (select public_org() as id),
  q as (
    select w.* from winep_actions w
    where w.organisation_id = (select id from org)
      and w.asset_id is null and w.sewage_system_id is null and w.water_body_id is null
      and not exists (select 1 from winep_asset_links l where l.winep_action_id = w.id)
  )
  select q.id, q.action_id, q.action_component, q.action_name, q.driver_code, q.driver_label,
         q.driver_obligation, q.completion_date,
         (q.completion_date is not null and q.completion_date < current_date) as overdue,
         sug.id, sug.asset_name, sug.match_kind
  from q
  left join lateral (
    select a.id, a.asset_name,
      case
        when q.action_name is not null
             and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1))
          then 'works-seg'
        when q.latitude is not null and a.latitude is not null and a.longitude is not null
             and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000)
          then 'proximity'
        else 'bathing-water'
      end as match_kind
    from sewage_assets a
    where a.organisation_id = (select id from org)
      and (
        (q.action_name is not null
          and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1)))
        or (q.latitude is not null and a.latitude is not null and a.longitude is not null
            and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                           ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000))
        or (a.bathing_water is not null and q.bathing_water is not null
            and upper(btrim(a.bathing_water)) = upper(btrim(q.bathing_water)))
        or (a.shellfish_water is not null and q.shellfish_water is not null
            and upper(btrim(a.shellfish_water)) = upper(btrim(q.shellfish_water)))
      )
    order by
      -- works-segment (exact) first, then nearest outlet, then a bathing-water peer
      (case
        when q.action_name is not null
             and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1)) then 0
        when q.latitude is not null and a.latitude is not null and a.longitude is not null
             and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000) then 1
        else 2 end),
      case when q.latitude is not null and a.latitude is not null and a.longitude is not null
           then ST_Distance(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography)
           else 1e9 end,
      a.asset_name
    limit 1
  ) sug on true
  order by q.completion_date nulls last, q.action_name;
$$;
grant execute on function measures_awaiting_linking() to authenticated;

notify pgrst, 'reload schema';
