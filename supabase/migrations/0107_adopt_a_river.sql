-- 0107 — Adopt a river: a public request form, a moderation queue, and approval that hands the
-- river to a local group.
--
-- * profiles.moderator — River Hub moderators, who review adoption requests for every river. Only
--   the service role (or a direct database session) can grant or remove it: a trigger stops a group
--   admin, who may otherwise update profiles in their own river, from making anyone a moderator.
-- * adoption_requests — what a group sends from /r/<river>/explore/adopt. Nobody reads the table
--   directly except moderators; the public writes only through submit_adoption_request(), which
--   validates the fields and limits repeat or bulk submissions.
-- * approve_adoption() / decide_adoption() — moderator decisions. Approving makes the river's
--   steward 'group' and gives it the group's name and website; the app then invites the contact as
--   the river's first admin (auth admin API, service role) and records the account here.

-- ---------- moderators ----------

alter table profiles add column if not exists moderator boolean not null default false;

-- Deliberately NOT security definer: it must see the caller's role. (As a definer function,
-- current_user would always be the owner and every caller would pass.)
create or replace function profiles_moderator_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.moderator)
     or (tg_op = 'UPDATE' and new.moderator is distinct from old.moderator) then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Only River Hub can grant or remove moderator access';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_moderator_guard on profiles;
create trigger profiles_moderator_guard before insert or update on profiles
  for each row execute function profiles_moderator_guard();

create or replace function is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and moderator)
$$;

-- ---------- requests ----------

do $$ begin
  create type adoption_status as enum ('pending', 'approved', 'rejected', 'spam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type adoption_group_kind as enum ('charity', 'community', 'club', 'council', 'education', 'other');
exception when duplicate_object then null; end $$;

create table if not exists adoption_requests (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,  -- the river
  group_name       text not null check (length(trim(group_name)) between 2 and 120),
  group_kind       adoption_group_kind not null default 'community',
  charity_number   text check (charity_number is null or length(charity_number) <= 40),
  website          text check (website is null or website ~* '^https?://[^\s]{3,}$' and length(website) <= 300),
  contact_name     text not null check (length(trim(contact_name)) between 2 and 120),
  contact_role     text not null check (length(trim(contact_role)) between 2 and 120),
  email            text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  phone            text check (phone is null or length(phone) <= 40),
  about            text not null check (length(trim(about)) between 30 and 3000),
  how_heard        text check (how_heard is null or length(how_heard) <= 300),
  status           adoption_status not null default 'pending',
  moderator_note   text,                 -- shared with the applicant when rejecting
  decided_by       uuid references profiles(id) on delete set null,
  decided_at       timestamptz,
  invited_user_id  uuid,                 -- auth user created or linked on approval
  ip_hash          text,                 -- salted hash, for rate limiting only
  created_at       timestamptz not null default now()
);
create index if not exists adoption_requests_status_idx on adoption_requests (status, created_at desc);
create index if not exists adoption_requests_org_idx on adoption_requests (organisation_id, status);

alter table adoption_requests enable row level security;
revoke all on adoption_requests from anon, authenticated;
grant select, update on adoption_requests to authenticated;

drop policy if exists adoption_mod_read on adoption_requests;
create policy adoption_mod_read on adoption_requests for select using (is_moderator());
drop policy if exists adoption_mod_update on adoption_requests;
create policy adoption_mod_update on adoption_requests for update using (is_moderator()) with check (is_moderator());

-- ---------- public submit ----------

-- Validates and stores one request. Limits: the river must be live and not already looked after by a
-- group; one pending request per email per river; at most 3 requests per email and 5 per IP hash in
-- 24 hours. Returns the request id. p_ip_hash is computed by the server (never the raw address).
create or replace function submit_adoption_request(
  p_org uuid, p_group_name text, p_group_kind adoption_group_kind, p_charity_number text, p_website text,
  p_contact_name text, p_contact_role text, p_email text, p_phone text, p_about text, p_how_heard text,
  p_ip_hash text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not exists (select 1 from organisations o where o.id = p_org and o.live and o.river_slug is not null) then
    raise exception 'river_not_found';
  end if;
  if exists (select 1 from organisations o where o.id = p_org and o.steward = 'group') then
    raise exception 'already_adopted';
  end if;
  if exists (select 1 from adoption_requests r where r.organisation_id = p_org and r.email = v_email and r.status = 'pending') then
    raise exception 'already_pending';
  end if;
  if (select count(*) from adoption_requests r where r.email = v_email and r.created_at > now() - interval '24 hours') >= 3
     or (p_ip_hash is not null and (select count(*) from adoption_requests r where r.ip_hash = p_ip_hash and r.created_at > now() - interval '24 hours') >= 5) then
    raise exception 'rate_limited';
  end if;

  insert into adoption_requests (organisation_id, group_name, group_kind, charity_number, website, contact_name,
    contact_role, email, phone, about, how_heard, ip_hash)
  values (p_org, trim(p_group_name), p_group_kind, nullif(trim(p_charity_number), ''), nullif(trim(p_website), ''),
    trim(p_contact_name), trim(p_contact_role), v_email, nullif(trim(p_phone), ''), trim(p_about),
    nullif(trim(p_how_heard), ''), p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;

-- Whether a river has a request under review (no details), for the public page's message.
create or replace function public_adoption_pending(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from adoption_requests r where r.organisation_id = p_org and r.status = 'pending')
$$;

-- ---------- moderator decisions ----------

-- Approve: hand the river to the group. Fails if the caller isn't a moderator, the request isn't
-- pending, or another group already looks after the river. Other pending requests for the same river
-- stay pending for the moderator to close.
create or replace function approve_adoption(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r adoption_requests;
begin
  if not is_moderator() then raise exception 'not_moderator'; end if;
  select * into r from adoption_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'not_pending'; end if;
  if exists (select 1 from organisations o where o.id = r.organisation_id and o.steward = 'group') then
    raise exception 'already_adopted';
  end if;

  update organisations
     set steward = 'group', name = r.group_name, marketing_url = coalesce(r.website, marketing_url)
   where id = r.organisation_id;
  update adoption_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  return r.organisation_id;
end $$;

-- Reject or mark as spam, with an optional note (sent to the applicant when rejecting).
create or replace function decide_adoption(p_id uuid, p_status adoption_status, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then raise exception 'not_moderator'; end if;
  if p_status not in ('rejected', 'spam') then raise exception 'use_approve'; end if;
  update adoption_requests
     set status = p_status, moderator_note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;

-- ---------- grants ----------

revoke all on function submit_adoption_request(uuid, text, adoption_group_kind, text, text, text, text, text, text, text, text, text) from public;
grant execute on function submit_adoption_request(uuid, text, adoption_group_kind, text, text, text, text, text, text, text, text, text) to anon, authenticated;
revoke all on function public_adoption_pending(uuid) from public;
grant execute on function public_adoption_pending(uuid) to anon, authenticated;
revoke all on function is_moderator() from public, anon;
grant execute on function is_moderator() to authenticated;
revoke all on function approve_adoption(uuid) from public, anon;
grant execute on function approve_adoption(uuid) to authenticated;
revoke all on function decide_adoption(uuid, adoption_status, text) from public, anon;
grant execute on function decide_adoption(uuid, adoption_status, text) to authenticated;
