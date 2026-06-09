-- River Hub — viewer role + account activation + write-permission helper.
-- Adds a read-only 'viewer' role and an 'active' flag; viewers (and inactive users) can read but
-- not write. current_org()/is_admin() now require the account to be active, so deactivating a user
-- denies them via RLS. Member-write tables move from "any org member" to can_edit() (admin/volunteer).

-- 1. new role value (ADD VALUE must be committed before use; psql autocommits each statement)
alter type app_role add value if not exists 'viewer';

-- 2. activation flag
alter table profiles add column if not exists active boolean not null default true;

-- 3. helpers: scope to active accounts; can_edit = admin or volunteer (not viewer)
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organisation_id from profiles where id = auth.uid() and active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin')
$$;

create or replace function can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role in ('admin', 'volunteer'))
$$;

-- 4. member-write policies: require can_edit() (was: any org member)
drop policy if exists site_write on test_sites;
create policy site_write on test_sites for all
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());

drop policy if exists result_write on test_results;
create policy result_write on test_results for all
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());

drop policy if exists photo_write on site_photos;
create policy photo_write on site_photos for all
  using (exists (select 1 from test_sites s where s.id = site_photos.site_id and s.organisation_id = current_org()))
  with check (can_edit() and exists (select 1 from test_sites s where s.id = site_photos.site_id and s.organisation_id = current_org()));

drop policy if exists asset_write on sewage_assets;
create policy asset_write on sewage_assets for all
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());

drop policy if exists permit_write on asset_permits;
create policy permit_write on asset_permits for all
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());

drop policy if exists sys_write on sewage_systems;
create policy sys_write on sewage_systems for all
  using (organisation_id = current_org()) with check (can_edit() and organisation_id = current_org());

drop policy if exists aphoto_write on asset_photos;
create policy aphoto_write on asset_photos for all
  using (exists (select 1 from sewage_assets a where a.id = asset_photos.asset_id and a.organisation_id = current_org()))
  with check (can_edit() and exists (select 1 from sewage_assets a where a.id = asset_photos.asset_id and a.organisation_id = current_org()));

grant execute on function can_edit() to authenticated;
