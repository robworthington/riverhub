-- 0109 — Roles follow the river a member is working on.
--
-- Since 0088 a member can belong to several rivers (profile_orgs, each with its own role) and switch
-- between them (profiles.active_organisation_id → current_org()). But is_admin() and can_edit() still
-- read profiles.role, the role in the member's *home* river. So a volunteer on the Dart who adopts the
-- Erme was not an admin on the Erme, and an Erme admin visiting the Dart kept admin powers there.
--
-- * my_role(): the member's role in the river they're currently working on: their profile_orgs role
--   there, or (for their home river with no membership row) profiles.role. Null if neither.
-- * is_admin() / can_edit() now use my_role(), so every RLS policy follows the current river.
-- * Every profile gets a membership row for its home river (back-fill), and profiles.role and the
--   home membership role are kept in step both ways.
-- * Admins can see and manage the memberships of their current river (and read those members'
--   profiles), so the Users page can list and change members whose home river is elsewhere.
-- * remove_river_member(): an admin removes a member whose home river is elsewhere from the current
--   river (deactivating is for the member's home river only, since it signs them out everywhere).

-- ---------- back-fill memberships ----------

insert into profile_orgs (profile_id, organisation_id, role)
  select id, organisation_id, role from profiles
  on conflict (profile_id, organisation_id) do nothing;

-- ---------- role in the current river ----------

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
           po.role,
           case when coalesce(p.active_organisation_id, p.organisation_id) = p.organisation_id then p.role end)
  from profiles p
  left join profile_orgs po
    on po.profile_id = p.id and po.organisation_id = coalesce(p.active_organisation_id, p.organisation_id)
  where p.id = auth.uid() and p.active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() = 'admin', false)
$$;

create or replace function can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('admin', 'volunteer'), false)
$$;

grant execute on function my_role() to authenticated;

-- ---------- keep home role and home membership in step ----------

create or replace function profile_orgs_sync_home_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = new.role
   where id = new.profile_id and organisation_id = new.organisation_id and role is distinct from new.role;
  return new;
end $$;

drop trigger if exists profile_orgs_sync_home_role on profile_orgs;
create trigger profile_orgs_sync_home_role after insert or update of role on profile_orgs
  for each row execute function profile_orgs_sync_home_role();

create or replace function profiles_sync_home_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_orgs (profile_id, organisation_id, role)
    values (new.id, new.organisation_id, new.role)
  on conflict (profile_id, organisation_id) do update set role = excluded.role
    where profile_orgs.role is distinct from excluded.role;
  return new;
end $$;

drop trigger if exists profiles_sync_home_membership on profiles;
create trigger profiles_sync_home_membership after insert or update of role, organisation_id on profiles
  for each row execute function profiles_sync_home_membership();

-- ---------- admins manage their river's members ----------

drop policy if exists profile_orgs_admin_read on profile_orgs;
create policy profile_orgs_admin_read on profile_orgs for select
  using (is_admin() and organisation_id = current_org());
drop policy if exists profile_orgs_admin_insert on profile_orgs;
create policy profile_orgs_admin_insert on profile_orgs for insert
  with check (is_admin() and organisation_id = current_org());
drop policy if exists profile_orgs_admin_update on profile_orgs;
create policy profile_orgs_admin_update on profile_orgs for update
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());
grant insert, update on profile_orgs to authenticated;

-- Members of the current river can see each other's profiles, wherever their home river is.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (
  organisation_id = current_org()
  or exists (select 1 from profile_orgs po where po.profile_id = profiles.id and po.organisation_id = current_org())
);

-- Remove a member from the current river. Only for members whose home river is elsewhere; never
-- yourself; never the river's last active admin.
create or replace function remove_river_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := current_org(); v_home uuid; v_role app_role;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  select organisation_id into v_home from profiles where id = p_profile;
  if v_home is null then raise exception 'not_found'; end if;
  if v_home = v_org then raise exception 'home_river'; end if;
  select role into v_role from profile_orgs where profile_id = p_profile and organisation_id = v_org;
  if v_role is null then raise exception 'not_member'; end if;
  if v_role = 'admin' and (
    select count(*) from profile_orgs po join profiles p on p.id = po.profile_id
     where po.organisation_id = v_org and po.role = 'admin' and p.active and po.profile_id <> p_profile) = 0 then
    raise exception 'last_admin';
  end if;
  delete from profile_orgs where profile_id = p_profile and organisation_id = v_org;
  update profiles set active_organisation_id = null where id = p_profile and active_organisation_id = v_org;
end $$;

revoke all on function remove_river_member(uuid) from public, anon;
grant execute on function remove_river_member(uuid) to authenticated;
revoke all on function profile_orgs_sync_home_role() from public, anon, authenticated;
revoke all on function profiles_sync_home_membership() from public, anon, authenticated;

notify pgrst, 'reload schema';
