-- 0119: Know which requests have already been sent from public pages, so the pages stop inviting
-- duplicates (WhatDoTheyKnow asked us to discourage duplicate requests, 25 Nov 2026).
--
-- Public pages (pollution incidents, the capacity page) offer pre-filled WhatDoTheyKnow links that
-- have no River Hub request record, so the daily sync (0108) found them in the feed but threw them
-- away as "unmatched". Those links now also carry a topic:<what is asked> tag (topic:incident-<EA ref>,
-- topic:permits). apply_wdtk_sync keeps each unmatched request that has a topic here: the link,
-- WhatDoTheyKnow's status and dates, and the river. No names: the feed's requester name is never
-- passed in. public_wdtk_topics(p_org) lists them for the pages.

create table if not exists public.wdtk_public_requests (
  wdtk_request_id integer primary key,
  organisation_id uuid references public.organisations(id) on delete cascade,
  topic text not null,
  url text not null,
  status info_request_status,
  wdtk_state text,
  sent_on date,
  answered_on date,
  synced_at timestamptz not null default now()
);
create index if not exists wdtk_public_requests_org_topic_idx on public.wdtk_public_requests (organisation_id, topic);
alter table public.wdtk_public_requests enable row level security;   -- read through the RPC only
revoke all on public.wdtk_public_requests from anon, authenticated;

-- p_rows: [{request_id?, url, wdtk_id, status?, wdtk_state, sent_on?, due_on?, answered_on?, river?, topic?}]
create or replace function apply_wdtk_sync(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  x jsonb; r info_requests; v_new info_request_status;
  n_matched int := 0; n_status int := 0; n_unmatched int := 0; n_public int := 0;
begin
  for x in select * from jsonb_array_elements(p_rows) loop
    r := null;
    if coalesce(x->>'request_id', '') ~ '^[0-9a-f-]{36}$' then
      select * into r from info_requests where id = (x->>'request_id')::uuid;
    end if;
    if r.id is null and nullif(x->>'url', '') is not null then
      select * into r from info_requests where rtrim(wdtk_url, '/') = rtrim(x->>'url', '/') limit 1;
    end if;
    if r.id is null then
      n_unmatched := n_unmatched + 1;
      -- sent from a public page: remember it by topic so the page can say it has been asked
      if nullif(x->>'topic', '') is not null and nullif(x->>'wdtk_id', '') is not null then
        insert into wdtk_public_requests (wdtk_request_id, organisation_id, topic, url, status, wdtk_state, sent_on, answered_on, synced_at)
        values ((x->>'wdtk_id')::integer,
                (select id from organisations where river_slug = x->>'river' limit 1),
                x->>'topic', x->>'url', nullif(x->>'status', '')::info_request_status, nullif(x->>'wdtk_state', ''),
                nullif(x->>'sent_on', '')::date, nullif(x->>'answered_on', '')::date, now())
        on conflict (wdtk_request_id) do update set
          organisation_id = coalesce(excluded.organisation_id, wdtk_public_requests.organisation_id),
          topic = excluded.topic, url = excluded.url,
          status = coalesce(excluded.status, wdtk_public_requests.status),
          wdtk_state = excluded.wdtk_state,
          sent_on = coalesce(wdtk_public_requests.sent_on, excluded.sent_on),
          answered_on = coalesce(excluded.answered_on, wdtk_public_requests.answered_on),
          synced_at = now();
        n_public := n_public + 1;
      end if;
      continue;
    end if;
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
  return jsonb_build_object('matched', n_matched, 'status_changed', n_status, 'unmatched', n_unmatched, 'public', n_public);
end $$;

revoke all on function apply_wdtk_sync(jsonb) from public, anon, authenticated;
grant execute on function apply_wdtk_sync(jsonb) to service_role;

-- Requests already sent from a river's public pages, newest first per topic. Withdrawn ones are left
-- out, so the page offers the request again.
create or replace function public.public_wdtk_topics(p_org uuid)
returns table (topic text, url text, status info_request_status, wdtk_state text, sent_on date, answered_on date)
language sql stable security definer set search_path = public as $$
  select distinct on (w.topic) w.topic, w.url, w.status, w.wdtk_state, w.sent_on, w.answered_on
  from wdtk_public_requests w
  where w.organisation_id = p_org and w.status is distinct from 'withdrawn'
  order by w.topic, w.sent_on desc nulls last, w.wdtk_request_id desc;
$$;
revoke all on function public.public_wdtk_topics(uuid) from public;
grant execute on function public.public_wdtk_topics(uuid) to anon, authenticated;
