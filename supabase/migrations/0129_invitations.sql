-- 0129: invitations and join requests (ROLES-AND-GROUPS-SPEC.md, build step 3).
--
-- Invitations: someone with the membership task invites an email address to their current group with
-- a base role and tasks. Nothing is added to the group until the person accepts, signed in as that
-- email address: either from the link in the email (a one-off token, stored only as a hash) or from
-- /auth/accept, which lists open invitations for their (confirmed) email. Invitations last 14 days and
-- can be re-sent (new token, new expiry) or cancelled.
--
-- Join requests: anyone can ask to join a group from its public page (name, email, a message). People
-- with the membership task invite them (which sends an ordinary invitation) or decline them. Rate
-- limited like adoption requests.
--
-- The invitation and request tables have no write rules; everything goes through the functions below.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade, -- the river they land on
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  full_name text check (full_name is null or length(full_name) <= 120),
  base_role public.base_role not null,
  tasks text[] not null default '{}' check (tasks <@ public.all_tasks()),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  join_request_id uuid
);
-- one open invitation per person per group
create unique index invitations_open on public.invitations (group_id, email)
  where accepted_at is null and cancelled_at is null;
create index invitations_email on public.invitations (email) where accepted_at is null and cancelled_at is null;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  message text check (message is null or length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'invited', 'declined', 'spam')),
  ip_hash text,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);
create index join_requests_group on public.join_requests (group_id, status);

alter table public.invitations
  add constraint invitations_join_request_fkey foreign key (join_request_id)
  references public.join_requests(id) on delete set null;

alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;

-- People with the membership task see their current group's invitations and requests.
create policy invitations_read on public.invitations for select
  using (group_id = (select current_group()) and (select has_task('membership')));
create policy join_requests_read on public.join_requests for select
  using (group_id = (select current_group()) and (select has_task('membership')));

-- ---------------------------------------------------------------- helpers

create function public.invite_token_hash(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest(p_token, 'sha256'), 'hex')
$$;

-- The signed-in person's email, only if Supabase has confirmed it.
create function public.my_confirmed_email() returns text
language sql stable security definer set search_path = public, extensions as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

-- ---------------------------------------------------------------- invitations

-- Invite an email address to my current group. Returns the one-off token for the link (only its hash
-- is stored). Replaces any open invitation to the same address.
create function public.create_invitation(p_email text, p_full_name text, p_base_role public.base_role,
                                         p_tasks text[], p_join_request uuid default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  g uuid := current_group();
  v_org uuid := current_org();
  v_email text := lower(trim(p_email));
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_tasks text[];
begin
  if g is null or v_org is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  if p_base_role = 'lead' and my_base_role() <> 'lead' then raise exception 'lead_only'; end if;
  if not (coalesce(p_tasks, '{}') <@ all_tasks()) then raise exception 'bad_task'; end if;
  if exists (select 1 from group_members m join auth.users u on u.id = m.profile_id
             where m.group_id = g and m.status = 'active' and lower(u.email) = v_email) then
    raise exception 'already_member';
  end if;
  v_tasks := case p_base_role when 'lead' then all_tasks() when 'viewer' then '{}'::text[]
                              else coalesce(p_tasks, default_tasks(p_base_role)) end;

  update invitations set cancelled_at = now()
   where group_id = g and email = v_email and accepted_at is null and cancelled_at is null;
  insert into invitations (group_id, organisation_id, email, full_name, base_role, tasks, token_hash,
                           expires_at, invited_by, join_request_id)
  values (g, v_org, v_email, nullif(trim(p_full_name), ''), p_base_role, v_tasks, invite_token_hash(v_token),
          now() + interval '14 days', auth.uid(), p_join_request);
  if p_join_request is not null then
    update join_requests set status = 'invited', decided_by = auth.uid(), decided_at = now()
     where id = p_join_request and group_id = g;
  end if;
  return v_token;
end $$;

-- A new token and another 14 days for an open invitation in my current group.
create function public.resend_invitation(p_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if current_group() is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  update invitations
     set token_hash = invite_token_hash(v_token), expires_at = now() + interval '14 days', sent_at = now()
   where id = p_id and group_id = current_group() and accepted_at is null and cancelled_at is null;
  if not found then raise exception 'not_open'; end if;
  return v_token;
end $$;

create function public.cancel_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if current_group() is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  update invitations set cancelled_at = now()
   where id = p_id and group_id = current_group() and accepted_at is null and cancelled_at is null;
  if not found then raise exception 'not_open'; end if;
end $$;

-- What a link is for, before signing in. Knowing the token is the proof.
create function public.invitation_preview(p_token text)
returns table (status text, email text, group_name text, river_name text, base_role public.base_role,
               invited_by_name text)
language sql stable security definer set search_path = public, extensions as $$
  select case when i.accepted_at is not null then 'accepted'
              when i.cancelled_at is not null then 'cancelled'
              when i.expires_at < now() then 'expired'
              else 'open' end,
         i.email, g.name, coalesce(o.river_name, o.name), i.base_role, p.full_name
  from invitations i
  join groups g on g.id = i.group_id
  join organisations o on o.id = i.organisation_id
  left join profiles p on p.id = i.invited_by
  where i.token_hash = invite_token_hash(p_token)
$$;

-- Open invitations for the signed-in person's confirmed email (the accept page lists these).
create function public.my_invitations()
returns table (id uuid, group_name text, river_name text, base_role public.base_role, invited_by_name text,
               expires_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select i.id, g.name, coalesce(o.river_name, o.name), i.base_role, p.full_name, i.expires_at
  from invitations i
  join groups g on g.id = i.group_id and g.status = 'active'
  join organisations o on o.id = i.organisation_id
  left join profiles p on p.id = i.invited_by
  where i.email = my_confirmed_email() and i.accepted_at is null and i.cancelled_at is null
    and i.expires_at > now()
  order by i.created_at
$$;

-- Accept an invitation, by its token or (from the list) by id. Signed in as the invited address only.
-- Creates the profile if this is a new account, adds the group membership and makes it the person's
-- current group and river. Someone already active in the group keeps the role they have.
create function public.accept_invitation(p_token text default null, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  v_email text := my_confirmed_email();
  inv invitations;
  v_was_member boolean;
  v_active boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if v_email is null then raise exception 'email_unconfirmed'; end if;
  select * into inv from invitations
   where (p_token is not null and token_hash = invite_token_hash(p_token))
      or (p_token is null and id = p_id)
   for update;
  if not found then raise exception 'not_found'; end if;
  if inv.accepted_at is not null then raise exception 'already_accepted'; end if;
  if inv.cancelled_at is not null then raise exception 'cancelled'; end if;
  if inv.expires_at < now() then raise exception 'expired'; end if;
  if inv.email <> v_email then raise exception 'wrong_account'; end if;

  select active into v_active from profiles where id = me;
  if v_active = false then raise exception 'account_deactivated'; end if;
  v_was_member := exists (select 1 from group_members where group_id = inv.group_id and profile_id = me and status = 'active');

  if v_active is null then
    -- a new account: its home river is the river it was invited to
    insert into profiles (id, organisation_id, full_name, role, active)
    values (me, inv.organisation_id, inv.full_name,
            case inv.base_role when 'lead' then 'admin'::app_role when 'viewer' then 'viewer'::app_role
                               else 'volunteer'::app_role end,
            true);
  end if;

  if not v_was_member then
    -- (the profiles trigger may already have added a row through the profile_orgs bridge: overwrite it)
    insert into group_members (group_id, profile_id, base_role, tasks, invited_by)
    values (inv.group_id, me, inv.base_role, inv.tasks, inv.invited_by)
    on conflict (group_id, profile_id) do update
      set base_role = excluded.base_role, tasks = excluded.tasks, status = 'active', invited_by = excluded.invited_by;
  end if;

  update profiles set active_group_id = inv.group_id, active_organisation_id = inv.organisation_id where id = me;
  update invitations set accepted_at = now(), accepted_by = me where id = inv.id;
  return inv.group_id;
end $$;

-- ---------------------------------------------------------------- join requests

-- From a group's public page. Anyone may call it.
create function public.submit_join_request(p_group_slug text, p_name text, p_email text, p_message text,
                                           p_ip_hash text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid; v_email text := lower(trim(p_email)); v_id uuid;
begin
  select id into g from groups where slug = p_group_slug and status = 'active';
  if g is null then raise exception 'group_not_found'; end if;
  if exists (select 1 from join_requests where group_id = g and email = v_email and status = 'pending') then
    raise exception 'already_pending';
  end if;
  if exists (select 1 from group_members m join auth.users u on u.id = m.profile_id
             where m.group_id = g and m.status = 'active' and lower(u.email) = v_email) then
    raise exception 'already_member';
  end if;
  if (select count(*) from join_requests where email = v_email and created_at > now() - interval '24 hours') >= 3
     or (p_ip_hash is not null and (select count(*) from join_requests where ip_hash = p_ip_hash
                                    and created_at > now() - interval '24 hours') >= 5)
     or (select count(*) from join_requests where group_id = g and status = 'pending') >= 100 then
    raise exception 'rate_limited';
  end if;
  insert into join_requests (group_id, name, email, message, ip_hash)
  values (g, trim(p_name), v_email, nullif(trim(p_message), ''), p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;

-- Decline (or mark as spam) a request to my current group. Inviting goes through create_invitation.
create function public.decide_join_request(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if current_group() is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  if p_status not in ('declined', 'spam') then raise exception 'bad_status'; end if;
  update join_requests set status = p_status, decided_by = auth.uid(), decided_at = now()
   where id = p_id and group_id = current_group() and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;

-- Only signed-in people can manage or accept invitations; anyone can preview a link or ask to join.
revoke execute on function public.create_invitation(text, text, public.base_role, text[], uuid) from public, anon;
revoke execute on function public.resend_invitation(uuid) from public, anon;
revoke execute on function public.cancel_invitation(uuid) from public, anon;
revoke execute on function public.my_invitations() from public, anon;
revoke execute on function public.accept_invitation(text, uuid) from public, anon;
revoke execute on function public.decide_join_request(uuid, text) from public, anon;
revoke execute on function public.my_confirmed_email() from public, anon;
grant execute on function public.create_invitation(text, text, public.base_role, text[], uuid) to authenticated;
grant execute on function public.resend_invitation(uuid) to authenticated;
grant execute on function public.cancel_invitation(uuid) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_invitation(text, uuid) to authenticated;
grant execute on function public.decide_join_request(uuid, text) to authenticated;
grant execute on function public.my_confirmed_email() to authenticated;
