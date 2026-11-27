-- 0126: groups, site roles, base roles and tasks (ROLES-AND-GROUPS-SPEC.md, build step 2, part 1).
--
-- Adds the new membership model alongside the old one and backfills it. The access rules move over in
-- 0127. After this migration:
--   * site_roles holds the owner and moderators (was profiles.moderator);
--   * a group is its own record, attached to one or more rivers (group_rivers);
--   * group_members gives each person a base role and a task list in a group;
--   * profiles.active_group_id is the group a member is working as, alongside active_organisation_id;
--   * group-owned tables carry group_id, filled automatically on insert.
--
-- current_org() now returns the active river only if the member is on it (through an active group) or
-- is the site owner. Before, a river admin could point their own active_organisation_id at any river.
--
-- is_admin(), can_edit(), my_role() and is_moderator() keep their names and meaning for the app, but
-- now read groups: admin = the settings task, can_edit = any base role but viewer. They go once every
-- page uses the task helpers. profile_orgs is left in place, read-only from 0127, and dropped later.

-- ---------------------------------------------------------------- types and tables

create type public.base_role as enum ('lead', 'coordinator', 'volunteer', 'viewer');
create type public.site_role as enum ('owner', 'moderator');

-- Every task a person can hold in a group. A lead always has all of them.
create function public.all_tasks() returns text[]
language sql immutable set search_path = public, extensions as $$
  select array['data_entry', 'sampling', 'photos', 'requests', 'regulatory', 'comms', 'membership', 'settings']
$$;

-- The starting task list for a base role (the lead can change it per person).
create function public.default_tasks(r public.base_role) returns text[]
language sql immutable set search_path = public, extensions as $$
  select case r
    when 'lead' then all_tasks()
    when 'coordinator' then array['data_entry', 'sampling', 'photos', 'requests']
    when 'volunteer' then array['data_entry']
    else array[]::text[] end
$$;

create table public.site_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.site_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website_url text,
  donate_url text,
  results_need_approval boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now()
);

create table public.group_rivers (
  group_id uuid not null references public.groups(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  since date not null default current_date,
  primary key (group_id, organisation_id)
);
create index group_rivers_river on public.group_rivers (organisation_id);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  base_role public.base_role not null default 'volunteer',
  tasks text[] not null default '{}' check (tasks <@ public.all_tasks()),
  status text not null default 'active' check (status in ('invited', 'requested', 'active', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index group_members_profile on public.group_members (profile_id) where status = 'active';

alter table public.profiles add column active_group_id uuid references public.groups(id) on delete set null;

alter table public.site_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_rivers enable row level security;
alter table public.group_members enable row level security;

-- ---------------------------------------------------------------- helpers
-- All stable security definer with the 0124 search path. None of them calls current_org() except
-- has_task(), so current_org() can use is_on_river() without a loop.

create function public.is_site_owner() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from site_roles s join profiles p on p.id = s.profile_id
    where s.profile_id = auth.uid() and s.role = 'owner' and p.active)
$$;

-- Moderators, and the owner.
create function public.is_site_moderator() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from site_roles s join profiles p on p.id = s.profile_id
    where s.profile_id = auth.uid() and p.active)
$$;

-- A member of any active group attached to the river (read access). The owner is on every river.
create function public.is_on_river(river uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_site_owner() or exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id and g.status = 'active'
    join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = river
    join profiles p on p.id = m.profile_id and p.active
    where m.profile_id = auth.uid() and m.status = 'active')
$$;

-- Any active group the member is in, attached to the river, gives them the task.
-- Used for records that belong to the river rather than one group (overflows, permits, WINEP links,
-- photo reports).
create function public.has_task_on_river(task text, river uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id and g.status = 'active'
    join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = river
    join profiles p on p.id = m.profile_id and p.active
    where m.profile_id = auth.uid() and m.status = 'active'
      and (m.base_role = 'lead' or task = any (m.tasks)))
$$;

-- The active river, if the member is on it. (Was: whatever active_organisation_id said.)
create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select x.org
  from (select coalesce(active_organisation_id, organisation_id) as org
        from profiles where id = auth.uid() and active) x
  where is_on_river(x.org)
$$;

-- The group the member is working as, if they are still active in it.
create function public.current_group() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select p.active_group_id
  from profiles p
  join group_members m on m.group_id = p.active_group_id and m.profile_id = p.id and m.status = 'active'
  join groups g on g.id = m.group_id and g.status = 'active'
  where p.id = auth.uid() and p.active
$$;

-- Base role in the current group, when that group works on the current river.
create function public.my_base_role() returns public.base_role
language sql stable security definer set search_path = public, extensions as $$
  select m.base_role
  from group_members m
  join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = current_org()
  where m.group_id = current_group() and m.profile_id = auth.uid()
$$;

-- The member holds the task in their current group, and that group works on the current river.
create function public.has_task(task text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from group_members m
    join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = current_org()
    where m.group_id = current_group() and m.profile_id = auth.uid()
      and (m.base_role = 'lead' or task = any (m.tasks)))
$$;

-- Active member of the group (used by the group_members read rule, which can't query itself).
create function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from group_members where group_id = g and profile_id = auth.uid() and status = 'active')
$$;

-- My tasks in the current group (for the app's menus). A lead gets the full list.
create function public.my_tasks() returns text[]
language sql stable security definer set search_path = public, extensions as $$
  select case when m.base_role = 'lead' then all_tasks() else m.tasks end
  from group_members m
  join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = current_org()
  where m.group_id = current_group() and m.profile_id = auth.uid()
$$;

-- ---------------------------------------------------------------- old helpers, now reading groups

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public, extensions as $$
  select case b when 'lead' then 'admin'::app_role
                when 'viewer' then 'viewer'::app_role
                else 'volunteer'::app_role end
  from (select my_base_role() as b) x
  where b is not null
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_task('settings')
$$;

create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(my_base_role() <> 'viewer', false)
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_site_moderator()
$$;

-- ---------------------------------------------------------------- group_id on group-owned tables

alter table public.test_sites      add column group_id uuid references public.groups(id);
alter table public.test_results    add column group_id uuid references public.groups(id);
alter table public.test_types      add column group_id uuid references public.groups(id);
alter table public.imports         add column group_id uuid references public.groups(id);
alter table public.import_profiles add column group_id uuid references public.groups(id);
alter table public.info_requests   add column group_id uuid references public.groups(id);
alter table public.river_photos    add column group_id uuid references public.groups(id);
alter table public.api_keys        add column group_id uuid references public.groups(id);

create index test_sites_group      on public.test_sites (group_id);
create index test_results_group    on public.test_results (group_id);
create index test_types_group      on public.test_types (group_id);
create index info_requests_group   on public.info_requests (group_id);

-- Fill group_id on insert: the inserting member's current group if it works on the row's river,
-- otherwise the river's only group (import scripts, which run as the service role). Left empty when
-- the river has no group or several.
create function public.fill_group_id() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.group_id is null then
    select gr.group_id into new.group_id
      from group_rivers gr
     where gr.organisation_id = new.organisation_id and gr.group_id = current_group();
    if new.group_id is null then
      select min(gr.group_id::text)::uuid into new.group_id
        from group_rivers gr where gr.organisation_id = new.organisation_id
      having count(*) = 1;
    end if;
  end if;
  return new;
end $$;

create trigger fill_group_id before insert on public.test_sites      for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.test_results    for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.test_types      for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.imports         for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.import_profiles for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.info_requests   for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.river_photos    for each row execute function public.fill_group_id();
create trigger fill_group_id before insert on public.api_keys        for each row execute function public.fill_group_id();

-- ---------------------------------------------------------------- guards

-- A group keeps at least one active lead.
create function public.group_members_keep_lead() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.base_role = 'lead' and old.status = 'active'
     and (tg_op = 'DELETE' or new.base_role <> 'lead' or new.status <> 'active')
     and exists (select 1 from groups where id = old.group_id)
     and not exists (
       select 1 from group_members
        where group_id = old.group_id and profile_id <> old.profile_id
          and base_role = 'lead' and status = 'active') then
    raise exception 'last_lead' using hint = 'A group must keep at least one lead.';
  end if;
  return coalesce(new, old);
end $$;

create trigger group_members_keep_lead before update or delete on public.group_members
  for each row execute function public.group_members_keep_lead();

-- ---------------------------------------------------------------- backfill

-- Moderators move to site_roles. Rob (the only account) is the owner.
insert into public.site_roles (profile_id, role)
  select id, 'moderator' from public.profiles where moderator
  on conflict do nothing;
insert into public.site_roles (profile_id, role)
  select id, 'owner' from public.profiles where id = '99608b23-fedf-450b-8aa3-e58c3c4eaa81'
  on conflict do nothing;

-- One group per river a group stewards today (Dart, Teign, Yealm), named after the river's group.
-- Approval stays off for these, as today; new groups default to on.
insert into public.groups (name, slug, logo_url, website_url, donate_url, results_need_approval)
  select o.name, o.slug, o.logo_url, o.marketing_url, o.donate_url, false
  from public.organisations o
  where o.steward = 'group';

insert into public.group_rivers (group_id, organisation_id)
  select g.id, o.id from public.organisations o join public.groups g on g.slug = o.slug
  where o.steward = 'group';

-- Any other river with members gets a group too (none today; kept for safety).
insert into public.groups (name, slug, results_need_approval)
  select coalesce(o.portal_name, o.name), o.slug, false
  from public.organisations o
  where exists (select 1 from public.profile_orgs po where po.organisation_id = o.id)
    and not exists (select 1 from public.group_rivers gr where gr.organisation_id = o.id)
  on conflict (slug) do nothing;
insert into public.group_rivers (group_id, organisation_id)
  select g.id, o.id from public.organisations o join public.groups g on g.slug = o.slug
  where not exists (select 1 from public.group_rivers gr where gr.organisation_id = o.id)
    and exists (select 1 from public.profile_orgs po where po.organisation_id = o.id);

-- Memberships: admin -> lead, volunteer -> volunteer, viewer -> viewer.
insert into public.group_members (group_id, profile_id, base_role, tasks)
  select gr.group_id, po.profile_id, r.b, default_tasks(r.b)
  from public.profile_orgs po
  join public.group_rivers gr on gr.organisation_id = po.organisation_id
  cross join lateral (select case po.role when 'admin' then 'lead'::base_role
                                          when 'volunteer' then 'volunteer'::base_role
                                          else 'viewer'::base_role end as b) r
  on conflict do nothing;

-- Active group = the group on the member's active river.
update public.profiles p
   set active_group_id = gr.group_id
  from public.group_rivers gr
 where gr.organisation_id = coalesce(p.active_organisation_id, p.organisation_id)
   and exists (select 1 from public.group_members m where m.group_id = gr.group_id and m.profile_id = p.id);

-- Existing group work belongs to its river's group.
update public.test_sites t      set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.test_results t    set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.test_types t      set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.imports t         set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.import_profiles t set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.info_requests t   set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.river_photos t    set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;
update public.api_keys t        set group_id = gr.group_id from public.group_rivers gr where gr.organisation_id = t.organisation_id and t.group_id is null;

-- ---------------------------------------------------------------- bridge from the old model
-- Until the Members page replaces /admin/users, changes there (and adoption set-up) still write
-- profile_orgs. Mirror them into the river's group when the river has exactly one.

create function public.profile_orgs_to_group() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid; r base_role;
begin
  select min(gr.group_id::text)::uuid into g
    from group_rivers gr where gr.organisation_id = coalesce(new.organisation_id, old.organisation_id)
  having count(*) = 1;
  if g is null then return coalesce(new, old); end if;

  if tg_op = 'DELETE' then
    delete from group_members where group_id = g and profile_id = old.profile_id;
    return old;
  end if;

  r := case new.role when 'admin' then 'lead'::base_role
                     when 'volunteer' then 'volunteer'::base_role
                     else 'viewer'::base_role end;
  insert into group_members (group_id, profile_id, base_role, tasks)
    values (g, new.profile_id, r, default_tasks(r))
  on conflict (group_id, profile_id) do update
    set base_role = excluded.base_role, tasks = excluded.tasks, status = 'active'
    where group_members.base_role is distinct from excluded.base_role
       or group_members.status <> 'active';
  update profiles set active_group_id = g
   where id = new.profile_id and active_group_id is null
     and coalesce(active_organisation_id, organisation_id) = new.organisation_id;
  return new;
end $$;

create trigger profile_orgs_to_group after insert or update of role or delete on public.profile_orgs
  for each row execute function public.profile_orgs_to_group();

-- Approving an adopt-a-river request now also creates the group and attaches it to the river, so the
-- lead set up afterwards (profile_orgs, mirrored above) lands in it.
create or replace function public.approve_adoption(p_id uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r adoption_requests; v_slug text; v_group uuid;
begin
  if not is_moderator() then raise exception 'not_moderator'; end if;
  select * into r from adoption_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'not_pending'; end if;
  if exists (select 1 from organisations o where o.id = r.organisation_id and o.steward = 'group') then
    raise exception 'already_adopted';
  end if;

  update organisations
     set steward = 'group', name = r.group_name, marketing_url = coalesce(r.website, marketing_url)
   where id = r.organisation_id
  returning slug into v_slug;

  if not exists (select 1 from group_rivers where organisation_id = r.organisation_id) then
    insert into groups (name, slug, website_url)
      values (r.group_name,
              case when exists (select 1 from groups where slug = v_slug)
                   then v_slug || '-' || substr(gen_random_uuid()::text, 1, 6) else v_slug end,
              r.website)
      returning id into v_group;
    insert into group_rivers (group_id, organisation_id) values (v_group, r.organisation_id);
  end if;

  update adoption_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  return r.organisation_id;
end $$;

-- ---------------------------------------------------------------- river switcher

-- The (group, river) pairs a member works on. Same columns as before, plus the group.
drop function if exists public.my_orgs();
create function public.my_orgs()
returns table (organisation_id uuid, org_name text, river_name text, portal_name text, role text,
               is_active boolean, group_id uuid, group_name text)
language sql stable security definer set search_path = public, extensions as $$
  select gr.organisation_id, o.name, o.river_name, o.portal_name,
         case m.base_role when 'lead' then 'admin' when 'viewer' then 'viewer' else 'volunteer' end,
         (gr.organisation_id = current_org() and m.group_id = current_group()),
         g.id, g.name
  from group_members m
  join groups g on g.id = m.group_id and g.status = 'active'
  join group_rivers gr on gr.group_id = m.group_id
  join organisations o on o.id = gr.organisation_id
  where m.profile_id = auth.uid() and m.status = 'active'
  order by o.river_name nulls last, o.name, g.name;
$$;

-- Switch river (and group). Without p_group, keep the current group if it works on the river,
-- otherwise take the member's first group there. The owner can open any river.
drop function if exists public.switch_org(uuid);
create function public.switch_org(p_org uuid, p_group uuid default null) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid;
begin
  select m.group_id into g
    from group_members m
    join groups gg on gg.id = m.group_id and gg.status = 'active'
    join group_rivers gr on gr.group_id = m.group_id and gr.organisation_id = p_org
   where m.profile_id = auth.uid() and m.status = 'active'
     and (p_group is null or m.group_id = p_group)
   order by (m.group_id = current_group()) desc nulls last, gg.name
   limit 1;
  if g is null and not is_site_owner() then return false; end if;
  update profiles set active_organisation_id = p_org, active_group_id = coalesce(g, active_group_id)
   where id = auth.uid() and active;
  return found;
end $$;

-- ---------------------------------------------------------------- members and group settings
-- The Members page and Group settings page call these; group_members and groups have no write rules.
-- All act on the caller's current group.

-- Add someone (who already has an account) to my current group, or bring them back.
create function public.add_group_member(p_profile uuid, p_base_role public.base_role) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group();
begin
  if g is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  if p_base_role = 'lead' and my_base_role() <> 'lead' then raise exception 'lead_only'; end if;
  insert into group_members (group_id, profile_id, base_role, tasks, invited_by)
    values (g, p_profile, p_base_role, default_tasks(p_base_role), auth.uid())
  on conflict (group_id, profile_id) do update
    set status = 'active', base_role = excluded.base_role, tasks = excluded.tasks
    where group_members.status <> 'active';
  -- someone with nowhere else to be starts in this group, on this river
  update profiles set active_group_id = g, active_organisation_id = current_org()
   where id = p_profile and active_group_id is null;
end $$;

-- Change a member's base role and tasks. Only a lead can make or unmake a lead.
create function public.set_group_member(p_profile uuid, p_base_role public.base_role, p_tasks text[])
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group(); old_role base_role;
begin
  if g is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  select base_role into old_role from group_members
   where group_id = g and profile_id = p_profile and status = 'active';
  if old_role is null then raise exception 'not_member'; end if;
  if (old_role = 'lead' or p_base_role = 'lead') and my_base_role() <> 'lead' then
    raise exception 'lead_only';
  end if;
  if not (coalesce(p_tasks, '{}') <@ all_tasks()) then raise exception 'bad_task'; end if;
  update group_members
     set base_role = p_base_role,
         tasks = case p_base_role when 'lead' then all_tasks()
                                  when 'viewer' then '{}'::text[]
                                  else coalesce(p_tasks, '{}') end
   where group_id = g and profile_id = p_profile;
end $$;

-- Remove a member from my current group. Their results stay with the group.
create function public.remove_group_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group(); old_role base_role;
begin
  if g is null or not has_task('membership') then raise exception 'not_allowed'; end if;
  if p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  select base_role into old_role from group_members
   where group_id = g and profile_id = p_profile and status = 'active';
  if old_role is null then raise exception 'not_member'; end if;
  if old_role = 'lead' and my_base_role() <> 'lead' then raise exception 'lead_only'; end if;
  update group_members set status = 'removed' where group_id = g and profile_id = p_profile;
  delete from profile_orgs po
   using group_rivers gr
   where gr.group_id = g and po.organisation_id = gr.organisation_id and po.profile_id = p_profile
     and not exists (select 1 from group_rivers gr2 join group_members m2 on m2.group_id = gr2.group_id
                     where gr2.organisation_id = gr.organisation_id and m2.profile_id = p_profile
                       and m2.status = 'active' and m2.group_id <> g);
  update profiles set active_group_id = null where id = p_profile and active_group_id = g;
end $$;

-- Group profile (comms) and settings (settings). Null leaves a field as it is; '' clears a link.
create function public.update_group(p_name text, p_logo_url text, p_website_url text, p_donate_url text,
                                    p_results_need_approval boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group();
begin
  if g is null then raise exception 'not_allowed'; end if;
  if (p_name is not null or p_logo_url is not null or p_website_url is not null or p_donate_url is not null)
     and not has_task('comms') then
    raise exception 'needs_comms';
  end if;
  if p_results_need_approval is not null and not has_task('settings') then
    raise exception 'needs_settings';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then raise exception 'name_required'; end if;
  update groups set
    name = coalesce(nullif(trim(p_name), ''), name),
    logo_url = case when p_logo_url is null then logo_url else nullif(trim(p_logo_url), '') end,
    website_url = case when p_website_url is null then website_url else nullif(trim(p_website_url), '') end,
    donate_url = case when p_donate_url is null then donate_url else nullif(trim(p_donate_url), '') end,
    results_need_approval = coalesce(p_results_need_approval, results_need_approval)
  where id = g;
end $$;

revoke execute on function public.add_group_member(uuid, public.base_role) from anon;
revoke execute on function public.set_group_member(uuid, public.base_role, text[]) from anon;
revoke execute on function public.remove_group_member(uuid) from anon;
revoke execute on function public.update_group(text, text, text, text, boolean) from anon;
