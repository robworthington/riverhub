-- 0108 — Keep the request log in step with WhatDoTheyKnow.
--
-- A daily cron (/api/cron/wdtk-sync) reads WhatDoTheyKnow's public search feed for requests tagged
-- "riverhub" (the pre-filled links add riverhub, river:<slug> and request:<our id>) and passes one row
-- per WhatDoTheyKnow request to apply_wdtk_sync(). Each row is matched to our request by the
-- request:<id> tag, or failing that by the WhatDoTheyKnow link a member saved. Matched requests get:
--   * their WhatDoTheyKnow link, sent date and 20-working-day due date, where still empty;
--   * a newer status, if WhatDoTheyKnow's is further along (never moving a request backwards, and
--     never overriding a complaint to the ICO that a member recorded);
--   * the reply date, once WhatDoTheyKnow shows a decision;
--   * wdtk_state / wdtk_synced_at, so members can see what WhatDoTheyKnow says and when it was checked.
-- Status changes are logged by the existing info_requests_guard trigger, plus a note naming the source.
-- The requester's name in the feed is never passed in or stored.

alter table info_requests add column if not exists wdtk_request_id integer;
alter table info_requests add column if not exists wdtk_state text;       -- WhatDoTheyKnow's own label, e.g. "Awaiting response"
alter table info_requests add column if not exists wdtk_synced_at timestamptz;

-- How far along a status is: a sync only ever moves a request forward.
create or replace function info_request_status_rank(s info_request_status) returns integer
language sql immutable as $$
  select case s
    when 'draft' then 0 when 'sent' then 1 when 'acknowledged' then 2 when 'extended' then 2
    when 'answered' then 3 when 'partial' then 3 when 'refused' then 3 when 'not_held' then 3
    when 'internal_review' then 4 when 'ico' then 5 when 'withdrawn' then 6 end
$$;

-- p_rows: [{request_id?, url, wdtk_id, status?, wdtk_state, sent_on?, due_on?, answered_on?}]
create or replace function apply_wdtk_sync(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  x jsonb; r info_requests; v_new info_request_status;
  n_matched int := 0; n_status int := 0; n_unmatched int := 0;
begin
  for x in select * from jsonb_array_elements(p_rows) loop
    r := null;
    if coalesce(x->>'request_id', '') ~ '^[0-9a-f-]{36}$' then
      select * into r from info_requests where id = (x->>'request_id')::uuid;
    end if;
    if r.id is null and nullif(x->>'url', '') is not null then
      select * into r from info_requests where rtrim(wdtk_url, '/') = rtrim(x->>'url', '/') limit 1;
    end if;
    if r.id is null then n_unmatched := n_unmatched + 1; continue; end if;
    n_matched := n_matched + 1;

    v_new := nullif(x->>'status', '')::info_request_status;
    if v_new is not null and (v_new = r.status or r.status = 'ico'
        or info_request_status_rank(v_new) < info_request_status_rank(r.status)) then
      v_new := null;
    end if;

    update info_requests set
      wdtk_url        = coalesce(wdtk_url, nullif(x->>'url', '')),
      wdtk_request_id = coalesce(nullif(x->>'wdtk_id', '')::integer, wdtk_request_id),
      wdtk_state      = nullif(x->>'wdtk_state', ''),
      wdtk_synced_at  = now(),
      sent_on         = coalesce(sent_on, nullif(x->>'sent_on', '')::date),
      due_on          = coalesce(due_on, nullif(x->>'due_on', '')::date),
      status          = coalesce(v_new, status),
      answered_on     = case when coalesce(v_new, status) in ('answered', 'partial', 'refused', 'not_held')
                             then coalesce(answered_on, nullif(x->>'answered_on', '')::date) else answered_on end
    where id = r.id;

    if v_new is not null then
      n_status := n_status + 1;
      insert into info_request_events (request_id, organisation_id, kind, note)
        values (r.id, r.organisation_id, 'note', 'Status updated from WhatDoTheyKnow: ' || coalesce(x->>'wdtk_state', v_new::text));
    end if;
  end loop;
  return jsonb_build_object('matched', n_matched, 'status_changed', n_status, 'unmatched', n_unmatched);
end $$;

revoke all on function apply_wdtk_sync(jsonb) from public, anon, authenticated;
grant execute on function apply_wdtk_sync(jsonb) to service_role;
