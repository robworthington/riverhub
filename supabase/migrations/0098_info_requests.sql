-- River Hub — EIR / FOI request log (design canvas "EIR / FOI log").
--
-- A river's group logs the information requests it sends (to the Environment Agency, the water
-- company, Ofwat …), tracks them against the statutory 20-working-day deadline, keeps the replies in
-- the private evidence bucket, and publishes the ones it chooses. Requests sent through
-- WhatDoTheyKnow are already public there; River Hub stores the link and tags the request so it can
-- be matched later.
--
-- Scoping follows the members app: rows belong to an organisation (river), members see their active
-- river's rows (current_org()), admins and volunteers can write (can_edit()), only admins delete or
-- publish. Anonymous visitors only ever see published requests, through public_info_requests().

do $$ begin
  create type info_request_law as enum ('eir', 'foi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type info_request_route as enum ('whatdotheyknow', 'direct');
exception when duplicate_object then null; end $$;

-- draft → sent → (acknowledged) → (extended) → answered | partial | refused | not_held
--   → internal_review → ico ; withdrawn at any point.
do $$ begin
  create type info_request_status as enum (
    'draft', 'sent', 'acknowledged', 'extended', 'answered', 'partial', 'refused', 'not_held',
    'internal_review', 'ico', 'withdrawn'
  );
exception when duplicate_object then null; end $$;

-- Which evidence layer a request is meant to fill (drives the public "what we know" ladder later).
do $$ begin
  create type info_request_layer as enum (
    'permits', 'emergency_overflows', 'incidents', 'flow_spill', 'capacity', 'other'
  );
exception when duplicate_object then null; end $$;

create table if not exists info_requests (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  authority        text not null,                 -- display name, e.g. "Environment Agency"
  authority_slug   text,                          -- WhatDoTheyKnow body url_name, e.g. environment_agency
  law              info_request_law not null default 'eir',
  route            info_request_route not null default 'whatdotheyknow',
  template         text,                          -- template key it started from (null = blank)
  layer            info_request_layer not null default 'other',
  title            text not null check (length(trim(title)) > 0),
  body             text,
  status           info_request_status not null default 'draft',
  sent_on          date,
  due_on           date,                          -- 20 working days after sent_on (set by the app)
  extended_to      date,                          -- EIR complex-request extension (40 working days)
  answered_on      date,
  authority_ref    text,                          -- the authority's own reference
  wdtk_url         text check (wdtk_url is null or wdtk_url ~ '^https://(www\.)?whatdotheyknow\.com/request/'),
  data_loaded      boolean not null default false, -- the reply has been imported into River Hub
  is_public        boolean not null default false, -- shown on the river's public pages
  notes            text,                          -- members only, never public
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists info_requests_org_idx on info_requests (organisation_id, status);

-- Overflows / works a request is about (optional; many-to-many).
create table if not exists info_request_assets (
  request_id      uuid not null references info_requests(id) on delete cascade,
  asset_id        uuid not null references sewage_assets(id) on delete cascade,
  primary key (request_id, asset_id)
);

-- The letter, replies and attachments, stored in the private 'evidence' bucket under
-- requests/<request_id>/… . organisation_id is copied from the request for simple RLS.
create table if not exists info_request_documents (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references info_requests(id) on delete cascade,
  organisation_id  uuid not null references organisations(id) on delete cascade,
  kind             text not null default 'reply' check (kind in ('letter', 'reply', 'attachment', 'other')),
  storage_path     text not null,
  file_name        text not null,
  uploaded_by      uuid references profiles(id),
  created_at       timestamptz not null default now()
);
create index if not exists info_request_documents_req_idx on info_request_documents (request_id);

-- Timeline: status changes (written by trigger) and members' notes.
create table if not exists info_request_events (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references info_requests(id) on delete cascade,
  organisation_id  uuid not null references organisations(id) on delete cascade,
  kind             text not null check (kind in ('created', 'status', 'note', 'document', 'published', 'unpublished')),
  status           info_request_status,
  note             text,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now()
);
create index if not exists info_request_events_req_idx on info_request_events (request_id, created_at);

-- ---------- triggers ----------

-- Keep updated_at fresh, stop non-admins publishing, and log status / publish changes.
create or replace function info_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.is_public and not is_admin() then
      raise exception 'Only a group admin can publish a request';
    end if;
    insert into info_request_events (request_id, organisation_id, kind, status, created_by)
      values (new.id, new.organisation_id, 'created', new.status, auth.uid());
    return new;
  end if;

  new.updated_at := now();
  if new.organisation_id <> old.organisation_id then
    raise exception 'A request cannot move to another river';
  end if;
  if new.is_public is distinct from old.is_public then
    if not is_admin() then
      raise exception 'Only a group admin can publish or unpublish a request';
    end if;
    insert into info_request_events (request_id, organisation_id, kind, created_by)
      values (new.id, new.organisation_id, case when new.is_public then 'published' else 'unpublished' end, auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into info_request_events (request_id, organisation_id, kind, status, created_by)
      values (new.id, new.organisation_id, 'status', new.status, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists info_requests_guard_ins on info_requests;
create trigger info_requests_guard_ins after insert on info_requests
  for each row execute function info_requests_guard();
drop trigger if exists info_requests_guard_upd on info_requests;
create trigger info_requests_guard_upd before update on info_requests
  for each row execute function info_requests_guard();

-- ---------- RLS ----------

alter table info_requests          enable row level security;
alter table info_request_assets    enable row level security;
alter table info_request_documents enable row level security;
alter table info_request_events    enable row level security;

drop policy if exists ir_read on info_requests;
create policy ir_read on info_requests for select using (organisation_id = current_org());
drop policy if exists ir_insert on info_requests;
create policy ir_insert on info_requests for insert with check (can_edit() and organisation_id = current_org());
drop policy if exists ir_update on info_requests;
create policy ir_update on info_requests for update
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());
drop policy if exists ir_delete on info_requests;
create policy ir_delete on info_requests for delete using (is_admin() and organisation_id = current_org());

drop policy if exists ira_read on info_request_assets;
create policy ira_read on info_request_assets for select using (
  exists (select 1 from info_requests r where r.id = request_id and r.organisation_id = current_org()));
drop policy if exists ira_write on info_request_assets;
create policy ira_write on info_request_assets for all
  using (exists (select 1 from info_requests r where r.id = request_id and r.organisation_id = current_org()))
  with check (can_edit() and exists (select 1 from info_requests r where r.id = request_id and r.organisation_id = current_org()));

drop policy if exists ird_read on info_request_documents;
create policy ird_read on info_request_documents for select using (organisation_id = current_org());
drop policy if exists ird_insert on info_request_documents;
create policy ird_insert on info_request_documents for insert with check (
  can_edit() and organisation_id = current_org()
  and exists (select 1 from info_requests r where r.id = request_id and r.organisation_id = current_org()));
drop policy if exists ird_delete on info_request_documents;
create policy ird_delete on info_request_documents for delete using (is_admin() and organisation_id = current_org());

drop policy if exists ire_read on info_request_events;
create policy ire_read on info_request_events for select using (organisation_id = current_org());
drop policy if exists ire_note on info_request_events;
create policy ire_note on info_request_events for insert with check (
  can_edit() and kind in ('note', 'document') and organisation_id = current_org()
  and exists (select 1 from info_requests r where r.id = request_id and r.organisation_id = current_org()));

-- Supabase's default privileges grant every new table to anon too; RLS would return nothing, but
-- anonymous access goes only through public_info_requests(), so take the table grants away.
revoke all on info_requests, info_request_assets, info_request_documents, info_request_events from anon;
grant select, insert, update, delete on info_requests, info_request_assets, info_request_documents to authenticated;
grant select, insert on info_request_events to authenticated;

-- ---------- public read (published only) ----------

-- A river's published requests, without members' notes or who created them.
create or replace function public_info_requests(p_org uuid)
returns table (
  id uuid, authority text, law info_request_law, layer info_request_layer, title text,
  status info_request_status, sent_on date, due_on date, extended_to date, answered_on date,
  wdtk_url text, data_loaded boolean
)
language sql stable security definer set search_path = public as $$
  select r.id, r.authority, r.law, r.layer, r.title, r.status, r.sent_on, r.due_on, r.extended_to,
         r.answered_on, r.wdtk_url, r.data_loaded
  from info_requests r
  join organisations o on o.id = r.organisation_id and o.live
  where r.organisation_id = p_org and r.is_public
  order by coalesce(r.sent_on, r.created_at::date) desc
$$;

-- Supabase grants EXECUTE on new functions to anon by default: keep the guard trigger function
-- private, and make the public reader explicit.
revoke all on function info_requests_guard() from public, anon, authenticated;
grant execute on function public_info_requests(uuid) to anon, authenticated;
