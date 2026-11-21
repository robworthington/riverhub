-- Phase 1 workstream B4 — members river-switcher.
--
-- Today a member belongs to exactly one org (profiles.organisation_id) and current_org() returns it.
-- On the national DB a member may cover more than one river, so this adds:
--   * profile_orgs — which orgs a member belongs to (seeded 1:1 from existing profiles),
--   * profiles.active_organisation_id — the member's currently-selected river, and
--   * current_org() now returns the active org, falling back to organisation_id.
-- Backward-compatible: single-org members have one membership and a null active org, so current_org()
-- is unchanged for them and every existing RLS policy keeps working.

-- Membership: a member ↔ org link, with the member's role in that org.
create table if not exists profile_orgs (
  profile_id      uuid not null references profiles(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  role            app_role not null default 'volunteer',
  created_at      timestamptz not null default now(),
  primary key (profile_id, organisation_id)
);

alter table profile_orgs enable row level security;
-- A member can read their own memberships (the switcher). Management (adding members to more rivers)
-- stays an admin/service-role operation for now.
drop policy if exists profile_orgs_self_select on profile_orgs;
create policy profile_orgs_self_select on profile_orgs for select
  using (profile_id = auth.uid());
grant select on profile_orgs to authenticated;

-- Seed one membership per existing profile, mirroring its current org + role (idempotent).
insert into profile_orgs (profile_id, organisation_id, role)
  select id, organisation_id, role from profiles
  on conflict (profile_id, organisation_id) do nothing;

-- The member's currently-selected river (null = their home organisation_id).
alter table profiles add column if not exists active_organisation_id uuid references organisations(id);

-- current_org() now honours the active selection, falling back to the home org.
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(active_organisation_id, organisation_id) from profiles where id = auth.uid() and active
$$;

-- Switch the active river. Only succeeds if the member actually belongs to the target org, so a member
-- can never scope themselves into a river they are not a member of. Returns true on success.
create or replace function switch_org(p_org uuid) returns boolean
language sql security definer set search_path = public as $$
  with upd as (
    update profiles set active_organisation_id = p_org
    where id = auth.uid() and active
      and exists (select 1 from profile_orgs po where po.profile_id = auth.uid() and po.organisation_id = p_org)
    returning 1
  )
  select exists (select 1 from upd);
$$;
grant execute on function switch_org(uuid) to authenticated;

-- The member's rivers, for the switcher (active one flagged).
create or replace function my_orgs()
returns table (organisation_id uuid, org_name text, river_name text, portal_name text, role text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select po.organisation_id, o.name, o.river_name, o.portal_name, po.role::text,
         (po.organisation_id = current_org()) as is_active
  from profile_orgs po
  join organisations o on o.id = po.organisation_id
  where po.profile_id = auth.uid()
  order by o.river_name nulls last, o.name;
$$;
grant execute on function my_orgs() to authenticated;

notify pgrst, 'reload schema';
