-- Members-only worklist: WINEP measures staged in the catchment but not yet attached to a specific
-- outlet, each with a suggested asset so an editor can link it in one place.
--
-- The importer stages in-scope-but-unlinked actions as winep_actions rows with asset_id / system /
-- water-body all null and no winep_asset_links row. Those are the editorial queue. For each, suggest
-- the best outlet: an asset whose first name segment matches the action's (works-segment), preferring
-- the nearest when the action is geocoded; else the nearest outlet within 2 km.

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
      case when q.action_name is not null
                and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1))
           then 'works-seg' else 'proximity' end as match_kind
    from sewage_assets a
    where a.organisation_id = (select id from org)
      and (
        (q.action_name is not null
          and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1)))
        or (q.latitude is not null and a.latitude is not null and a.longitude is not null
            and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                           ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography, 2000))
      )
    order by
      (case when q.action_name is not null
             and upper(split_part(a.asset_name, '_', 1)) = upper(split_part(q.action_name, '_', 1))
            then 0 else 1 end),
      case when q.latitude is not null and a.latitude is not null and a.longitude is not null
           then ST_Distance(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)::geography)
           else 1e9 end
    limit 1
  ) sug on true
  order by q.completion_date nulls last, q.action_name;
$$;
grant execute on function measures_awaiting_linking() to authenticated;

notify pgrst, 'reload schema';
