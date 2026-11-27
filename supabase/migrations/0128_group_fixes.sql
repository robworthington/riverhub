-- 0128: fixes found testing 0126/0127 on the live database (27 Nov 2026).
--
-- 1. profile_orgs is now read-only for members. Its admin insert/update rules let anyone with the
--    settings task write a role there, and the 0126 bridge copied "admin" into the group as lead,
--    which skipped the rule that only a lead makes a lead. The Members page uses add/set/remove_group_member;
--    the adoption set-up writes profile_orgs with the service role and still works.
-- 2. Editing other people's profiles (the old Users page) needs the membership task, not settings.
-- 3. A stale active group: the bridge removed a membership without clearing active_group_id, and
--    add_group_member only set the active group when it was empty. Both now treat a group the person
--    is no longer active in as empty.
--
-- (0128 was pencilled in for invitations in the spec; they move to 0129.)

drop policy if exists profile_orgs_admin_insert on public.profile_orgs;
drop policy if exists profile_orgs_admin_update on public.profile_orgs;

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all
  using ((select has_task('membership')) and organisation_id = (select current_org()))
  with check ((select has_task('membership')) and organisation_id = (select current_org()));

create or replace function public.add_group_member(p_profile uuid, p_base_role public.base_role) returns void
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
  -- someone with no (valid) current group starts in this group, on this river
  update profiles p set active_group_id = g, active_organisation_id = current_org()
   where p.id = p_profile
     and (p.active_group_id is null or not exists (
           select 1 from group_members m
            where m.group_id = p.active_group_id and m.profile_id = p.id and m.status = 'active'));
end $$;

create or replace function public.profile_orgs_to_group() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid; r base_role;
begin
  select min(gr.group_id::text)::uuid into g
    from group_rivers gr where gr.organisation_id = coalesce(new.organisation_id, old.organisation_id)
  having count(*) = 1;
  if g is null then return coalesce(new, old); end if;

  if tg_op = 'DELETE' then
    delete from group_members where group_id = g and profile_id = old.profile_id;
    update profiles set active_group_id = null where id = old.profile_id and active_group_id = g;
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
