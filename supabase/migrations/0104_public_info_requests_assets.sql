-- 0104 — Published information requests on public pages.
--
-- public_info_requests() (0098) listed a river's published requests but couldn't say which
-- overflows or works each one is about, or list only the requests about one overflow. Recreate it
-- with:
--   * p_asset (optional): only requests linked to that overflow or works, for its own page;
--   * assets: the overflows / works each request is linked to ({id, name, type}), for links;
--   * drafts left out, as public_river_evidence() already does: a draft hasn't been sent.
-- The return type changes, so drop and recreate. Nothing in the app called the 0098 version.

drop function if exists public_info_requests(uuid);

create or replace function public_info_requests(p_org uuid, p_asset uuid default null)
returns table (
  id uuid, authority text, law info_request_law, layer info_request_layer, title text,
  status info_request_status, sent_on date, due_on date, extended_to date, answered_on date,
  wdtk_url text, data_loaded boolean, assets jsonb
)
language sql stable security definer set search_path = public as $$
  select r.id, r.authority, r.law, r.layer, r.title, r.status, r.sent_on, r.due_on, r.extended_to,
         r.answered_on, r.wdtk_url, r.data_loaded,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.asset_name, 'type', a.asset_type)
                            order by a.asset_name)
           from info_request_assets ra
           join sewage_assets a on a.id = ra.asset_id and a.organisation_id = r.organisation_id
           where ra.request_id = r.id
         ), '[]'::jsonb)
  from info_requests r
  join organisations o on o.id = r.organisation_id and o.live
  where r.organisation_id = p_org
    and r.is_public
    and r.status <> 'draft'
    and (p_asset is null or exists (
      select 1 from info_request_assets ra where ra.request_id = r.id and ra.asset_id = p_asset))
  order by coalesce(r.sent_on, r.created_at::date) desc, r.created_at desc
$$;

revoke all on function public_info_requests(uuid, uuid) from public;
grant execute on function public_info_requests(uuid, uuid) to anon, authenticated;
