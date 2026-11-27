-- 0127: access rules on the group model (ROLES-AND-GROUPS-SPEC.md, build step 2, part 2).
--
-- Reads stay "the river you are working on" (current_org(), which from 0126 is only a river you are on).
-- Writes move from admin/editor to tasks:
--   * river data from imports: the site owner only (import scripts use the service role);
--   * river records (overflows, systems, permits, overflow photos, WINEP links): the regulatory task
--     in any of your groups on the river;
--   * group work (sites, results, test types, imports, requests, river photos, API keys): your current
--     group, on the current river, with the task for that kind of work;
--   * photo reports: the photos task on the river, or a site moderator.
-- Every USING carries the same role check as its WITH CHECK, so deletes need the task too.
-- Helpers are wrapped in (select ...) so each runs once per query, not once per row.
--
-- profile_orgs and profiles keep their admin rules (is_admin() is now the settings task) until the
-- Members page replaces /admin/users.

-- ---------------------------------------------------------------- river data from imports: read on the river, write by the owner

drop policy if exists ea_wqs_admin_write on public.ea_wq_samples;
drop policy if exists ea_wqs_read on public.ea_wq_samples;
create policy ea_wqs_read on public.ea_wq_samples for select
  using (organisation_id = (select current_org()));

drop policy if exists ea_wqs_owner_write on public.ea_wq_samples;
create policy ea_wqs_owner_write on public.ea_wq_samples for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists ea_wq_admin_write on public.ea_wq_stats;
drop policy if exists ea_wq_read on public.ea_wq_stats;
create policy ea_wq_read on public.ea_wq_stats for select
  using (organisation_id = (select current_org()));

drop policy if exists ea_wq_owner_write on public.ea_wq_stats;
create policy ea_wq_owner_write on public.ea_wq_stats for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists eas_admin_write on public.edm_annual_stats;
drop policy if exists eas_read on public.edm_annual_stats;
create policy eas_read on public.edm_annual_stats for select
  using (organisation_id = (select current_org()));

drop policy if exists eas_owner_write on public.edm_annual_stats;
create policy eas_owner_write on public.edm_annual_stats for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists edm_admin_write on public.edm_snapshots;
drop policy if exists edm_read on public.edm_snapshots;
create policy edm_read on public.edm_snapshots for select
  using (organisation_id = (select current_org()));

drop policy if exists edm_owner_write on public.edm_snapshots;
create policy edm_owner_write on public.edm_snapshots for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists eo_admin_write on public.emergency_overflows;
drop policy if exists eo_read on public.emergency_overflows;
create policy eo_read on public.emergency_overflows for select
  using (organisation_id = (select current_org()));

drop policy if exists eo_owner_write on public.emergency_overflows;
create policy eo_owner_write on public.emergency_overflows for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists eos_admin_write on public.eo_annual_spills;
drop policy if exists eos_read on public.eo_annual_spills;
create policy eos_read on public.eo_annual_spills for select
  using (organisation_id = (select current_org()));

drop policy if exists eos_owner_write on public.eo_annual_spills;
create policy eos_owner_write on public.eo_annual_spills for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists flow_admin_write on public.flow_readings;
drop policy if exists flow_read on public.flow_readings;
create policy flow_read on public.flow_readings for select
  using (organisation_id = (select current_org()));

drop policy if exists flow_owner_write on public.flow_readings;
create policy flow_owner_write on public.flow_readings for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists protected_areas_admin_write on public.protected_areas;
drop policy if exists protected_areas_read on public.protected_areas;
create policy protected_areas_read on public.protected_areas for select
  using (organisation_id = (select current_org()));

drop policy if exists protected_areas_owner_write on public.protected_areas;
create policy protected_areas_owner_write on public.protected_areas for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists rain_admin_write on public.rainfall_readings;
drop policy if exists rain_read on public.rainfall_readings;
create policy rain_read on public.rainfall_readings for select
  using (organisation_id = (select current_org()));

drop policy if exists rain_owner_write on public.rainfall_readings;
create policy rain_owner_write on public.rainfall_readings for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists rain_station_admin_write on public.rainfall_stations;
drop policy if exists rain_station_read on public.rainfall_stations;
create policy rain_station_read on public.rainfall_stations for select
  using (organisation_id = (select current_org()));

drop policy if exists rain_station_owner_write on public.rainfall_stations;
create policy rain_station_owner_write on public.rainfall_stations for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists gauge_admin_write on public.river_gauges;
drop policy if exists gauge_read on public.river_gauges;
create policy gauge_read on public.river_gauges for select
  using (organisation_id = (select current_org()));

drop policy if exists gauge_owner_write on public.river_gauges;
create policy gauge_owner_write on public.river_gauges for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists se_admin_write on public.spill_events;
drop policy if exists se_read on public.spill_events;
create policy se_read on public.spill_events for select
  using (organisation_id = (select current_org()));

drop policy if exists se_owner_write on public.spill_events;
create policy se_owner_write on public.spill_events for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists sysasmp_admin_write on public.system_assumptions;
drop policy if exists sysasmp_read on public.system_assumptions;
create policy sysasmp_read on public.system_assumptions for select
  using (organisation_id = (select current_org()));

drop policy if exists sysasmp_owner_write on public.system_assumptions;
create policy sysasmp_owner_write on public.system_assumptions for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists wwc_admin_write on public.wastewater_catchments;
drop policy if exists wwc_read on public.wastewater_catchments;
create policy wwc_read on public.wastewater_catchments for select
  using (organisation_id = (select current_org()));

drop policy if exists wwc_owner_write on public.wastewater_catchments;
create policy wwc_owner_write on public.wastewater_catchments for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists wb_admin_write on public.water_bodies;
drop policy if exists wb_read on public.water_bodies;
create policy wb_read on public.water_bodies for select
  using (organisation_id = (select current_org()));

drop policy if exists wb_owner_write on public.water_bodies;
create policy wb_owner_write on public.water_bodies for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

drop policy if exists winep_admin_write on public.winep_actions;
drop policy if exists winep_read on public.winep_actions;
create policy winep_read on public.winep_actions for select
  using (organisation_id = (select current_org()));

drop policy if exists winep_owner_write on public.winep_actions;
create policy winep_owner_write on public.winep_actions for all
  using ((select is_site_owner()) and organisation_id = (select current_org()))
  with check ((select is_site_owner()) and organisation_id = (select current_org()));

-- ---------------------------------------------------------------- river records: the regulatory task in any of your groups on the river

drop policy if exists asset_read on public.sewage_assets;
create policy asset_read on public.sewage_assets for select
  using (organisation_id = (select current_org()));

drop policy if exists asset_write on public.sewage_assets;
create policy asset_write on public.sewage_assets for all
  using (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())))
  with check (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())));

drop policy if exists sys_read on public.sewage_systems;
create policy sys_read on public.sewage_systems for select
  using (organisation_id = (select current_org()));

drop policy if exists sys_write on public.sewage_systems;
create policy sys_write on public.sewage_systems for all
  using (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())))
  with check (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())));

drop policy if exists permit_read on public.asset_permits;
create policy permit_read on public.asset_permits for select
  using (organisation_id = (select current_org()));

drop policy if exists permit_write on public.asset_permits;
create policy permit_write on public.asset_permits for all
  using (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())))
  with check (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())));

drop policy if exists winep_asset_links_read on public.winep_asset_links;
create policy winep_asset_links_read on public.winep_asset_links for select
  using (organisation_id = (select current_org()));

drop policy if exists winep_asset_links_write on public.winep_asset_links;
create policy winep_asset_links_write on public.winep_asset_links for all
  using (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())))
  with check (organisation_id = (select current_org()) and (select has_task_on_river('regulatory', current_org())));

drop policy if exists aphoto_read on public.asset_photos;
create policy aphoto_read on public.asset_photos for select
  using (exists (select 1 from public.sewage_assets a where a.id = asset_photos.asset_id and a.organisation_id = (select current_org())));

drop policy if exists aphoto_write on public.asset_photos;
create policy aphoto_write on public.asset_photos for all
  using ((select has_task_on_river('regulatory', current_org())) and exists (select 1 from public.sewage_assets a where a.id = asset_photos.asset_id and a.organisation_id = (select current_org())))
  with check ((select has_task_on_river('regulatory', current_org())) and exists (select 1 from public.sewage_assets a where a.id = asset_photos.asset_id and a.organisation_id = (select current_org())));

-- ---------------------------------------------------------------- group work: read across the river, write in your current group by task

drop policy if exists result_read on public.test_results;
create policy result_read on public.test_results for select
  using (organisation_id = (select current_org()));

drop policy if exists result_write on public.test_results;
create policy result_write on public.test_results for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and ((select has_task('data_entry')) or (select has_task('sampling'))))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and ((select has_task('data_entry')) or (select has_task('sampling'))));

drop policy if exists site_read on public.test_sites;
create policy site_read on public.test_sites for select
  using (organisation_id = (select current_org()));

drop policy if exists site_write on public.test_sites;
create policy site_write on public.test_sites for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('sampling')))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('sampling')));

drop policy if exists imports_read on public.imports;
create policy imports_read on public.imports for select
  using (organisation_id = (select current_org()));

drop policy if exists imports_write on public.imports;
create policy imports_write on public.imports for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('data_entry')))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('data_entry')));

drop policy if exists import_profiles_read on public.import_profiles;
create policy import_profiles_read on public.import_profiles for select
  using (organisation_id = (select current_org()));

drop policy if exists import_profiles_write on public.import_profiles;
create policy import_profiles_write on public.import_profiles for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('data_entry')))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('data_entry')));

drop policy if exists tt_read on public.test_types;
create policy tt_read on public.test_types for select
  using (organisation_id = (select current_org()));

drop policy if exists tt_admin_write on public.test_types;
drop policy if exists tt_write on public.test_types;
create policy tt_write on public.test_types for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('sampling')))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('sampling')));

drop policy if exists api_keys_admin on public.api_keys;
drop policy if exists api_keys_write on public.api_keys;
create policy api_keys_write on public.api_keys for all
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('settings')))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('settings')));

drop policy if exists photo_read on public.site_photos;
create policy photo_read on public.site_photos for select
  using (exists (select 1 from public.test_sites s where s.id = site_photos.site_id and s.organisation_id = (select current_org())));

drop policy if exists photo_write on public.site_photos;
create policy photo_write on public.site_photos for all
  using (((select has_task('data_entry')) or (select has_task('sampling'))) and exists (select 1 from public.test_sites s where s.id = site_photos.site_id and s.organisation_id = (select current_org()) and s.group_id = (select current_group())))
  with check (((select has_task('data_entry')) or (select has_task('sampling'))) and exists (select 1 from public.test_sites s where s.id = site_photos.site_id and s.organisation_id = (select current_org()) and s.group_id = (select current_group())));

-- ---------------------------------------------------------------- information requests: anyone but a viewer drafts; the requests task publishes and deletes

drop policy if exists ir_read on public.info_requests;
create policy ir_read on public.info_requests for select
  using (organisation_id = (select current_org()));

drop policy if exists ir_insert on public.info_requests;
create policy ir_insert on public.info_requests for insert
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select can_edit()));

drop policy if exists ir_update on public.info_requests;
create policy ir_update on public.info_requests for update
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select can_edit()))
  with check (organisation_id = (select current_org()) and group_id = (select current_group()) and (select can_edit()));

drop policy if exists ir_delete on public.info_requests;
create policy ir_delete on public.info_requests for delete
  using (organisation_id = (select current_org()) and group_id = (select current_group()) and (select has_task('requests')));

drop policy if exists ird_read on public.info_request_documents;
create policy ird_read on public.info_request_documents for select
  using (organisation_id = (select current_org()));

drop policy if exists ird_insert on public.info_request_documents;
create policy ird_insert on public.info_request_documents for insert
  with check ((select can_edit()) and organisation_id = (select current_org()) and exists (select 1 from public.info_requests r where r.id = info_request_documents.request_id and r.organisation_id = (select current_org()) and r.group_id = (select current_group())));

drop policy if exists ird_delete on public.info_request_documents;
create policy ird_delete on public.info_request_documents for delete
  using ((select has_task('requests')) and organisation_id = (select current_org()) and exists (select 1 from public.info_requests r where r.id = info_request_documents.request_id and r.organisation_id = (select current_org()) and r.group_id = (select current_group())));

drop policy if exists ire_read on public.info_request_events;
create policy ire_read on public.info_request_events for select
  using (organisation_id = (select current_org()));

drop policy if exists ire_note on public.info_request_events;
create policy ire_note on public.info_request_events for insert
  with check ((select can_edit()) and kind = any (array['note', 'document']) and organisation_id = (select current_org()) and exists (select 1 from public.info_requests r where r.id = info_request_events.request_id and r.organisation_id = (select current_org()) and r.group_id = (select current_group())));

drop policy if exists ira_read on public.info_request_assets;
create policy ira_read on public.info_request_assets for select
  using (exists (select 1 from public.info_requests r where r.id = info_request_assets.request_id and r.organisation_id = (select current_org())));

drop policy if exists ira_write on public.info_request_assets;
create policy ira_write on public.info_request_assets for all
  using ((select can_edit()) and exists (select 1 from public.info_requests r where r.id = info_request_assets.request_id and r.organisation_id = (select current_org()) and r.group_id = (select current_group())))
  with check ((select can_edit()) and exists (select 1 from public.info_requests r where r.id = info_request_assets.request_id and r.organisation_id = (select current_org()) and r.group_id = (select current_group())));

-- ---------------------------------------------------------------- river photos and photo reports: the photos task on the river

drop policy if exists rp_read on public.river_photos;
create policy rp_read on public.river_photos for select
  using (organisation_id = (select current_org()));

drop policy if exists rp_insert on public.river_photos;
create policy rp_insert on public.river_photos for insert
  with check ((select can_edit()) and organisation_id = (select current_org()) and group_id = (select current_group()) and status = 'pending' and not is_hero and public_path is null and thumb_public_path is null and uploaded_by = auth.uid());

drop policy if exists rp_update on public.river_photos;
create policy rp_update on public.river_photos for update
  using (organisation_id = (select current_org()) and (select has_task_on_river('photos', current_org())))
  with check (organisation_id = (select current_org()) and (select has_task_on_river('photos', current_org())));

drop policy if exists rp_delete on public.river_photos;
create policy rp_delete on public.river_photos for delete
  using (organisation_id = (select current_org()) and ((select has_task_on_river('photos', current_org())) or (uploaded_by = auth.uid() and status = 'pending')));

drop policy if exists photo_reports_read on public.photo_reports;
create policy photo_reports_read on public.photo_reports for select
  using ((select is_site_moderator()) or has_task_on_river('photos', organisation_id));

drop policy if exists photo_reports_update on public.photo_reports;
create policy photo_reports_update on public.photo_reports for update
  using ((select is_site_moderator()) or has_task_on_river('photos', organisation_id))
  with check ((select is_site_moderator()) or has_task_on_river('photos', organisation_id));

-- ---------------------------------------------------------------- profiles: also visible to people in your current group

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or organisation_id = (select current_org()) or exists (select 1 from public.profile_orgs po where po.profile_id = profiles.id and po.organisation_id = (select current_org())) or exists (select 1 from public.group_members m where m.profile_id = profiles.id and m.group_id = (select current_group()) and m.status = 'active'));

-- ---------------------------------------------------------------- new tables (writes go through security definer functions and the profile_orgs bridge)

drop policy if exists site_roles_read on public.site_roles;
create policy site_roles_read on public.site_roles for select
  using (profile_id = auth.uid() or (select is_site_owner()));

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select
  using (true);

drop policy if exists group_rivers_read on public.group_rivers;
create policy group_rivers_read on public.group_rivers for select
  using (true);

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members for select
  using (profile_id = auth.uid() or (select is_site_owner()) or is_group_member(group_id));

-- ---------------------------------------------------------------- functions that checked admin

-- Publishing a request needs the requests task (was: river admin).
create or replace function public.info_requests_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.is_public and not has_task('requests') then
      raise exception 'Only someone with the requests task can publish a request';
    end if;
    insert into info_request_events (request_id, organisation_id, kind, status, created_by)
      values (new.id, new.organisation_id, 'created', new.status, auth.uid());
    return new;
  end if;

  new.updated_at := now();
  if new.organisation_id <> old.organisation_id then
    raise exception 'A request cannot move to another river';
  end if;
  if new.group_id is distinct from old.group_id and auth.uid() is not null then
    raise exception 'A request cannot move to another group';
  end if;
  if new.is_public is distinct from old.is_public then
    if not has_task('requests') then
      raise exception 'Only someone with the requests task can publish or unpublish a request';
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

-- Photo reports: the photos task on the photo's river, or a site moderator.
create or replace function public.resolve_photo_reports(p_photo uuid, p_outcome text) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; n int;
begin
  if p_outcome not in ('kept', 'hidden') then raise exception 'bad_outcome'; end if;
  select organisation_id into v_org from river_photos where id = p_photo;
  if v_org is null then raise exception 'photo_not_found'; end if;
  if not (is_site_moderator() or has_task_on_river('photos', v_org)) then raise exception 'not_allowed'; end if;
  update photo_reports set status = p_outcome, decided_by = auth.uid(), decided_at = now()
   where photo_id = p_photo and status = 'pending';
  get diagnostics n = row_count;
  update river_photos set hidden_by_reports = false where id = p_photo;
  return n;
end $$;
