-- 0125: close two holes in the member write rules (ROLES-AND-GROUPS-SPEC.md, build step 1).
--
-- 1. Viewers could delete. Each "*_write" policy below is FOR ALL with the role check (can_edit())
--    only in WITH CHECK. WITH CHECK governs the new row on INSERT/UPDATE; DELETE is governed by USING
--    alone, so a viewer on the river could delete results, sites, overflows, systems, permits, photos
--    and request links. Fix: put can_edit() in USING too.
--
-- 2. winep_asset_links matched the member's home river (profiles.organisation_id), not the river they
--    are working on (current_org()), and had no role check at all, so any member, viewers included,
--    could write links. Fix: current_org() for read and write; can_edit() for write.
--
-- Also: info_requests UPDATE had no role check in USING (WITH CHECK caught it, but align it).
--
-- No data changes. Import scripts and cron jobs use the service role and are unaffected.

-- 1. role check in USING on the ALL write policies
alter policy result_write on public.test_results
  using (can_edit() and organisation_id = current_org());

alter policy site_write on public.test_sites
  using (can_edit() and organisation_id = current_org());

alter policy asset_write on public.sewage_assets
  using (can_edit() and organisation_id = current_org());

alter policy sys_write on public.sewage_systems
  using (can_edit() and organisation_id = current_org());

alter policy permit_write on public.asset_permits
  using (can_edit() and organisation_id = current_org());

alter policy photo_write on public.site_photos
  using (can_edit() and exists (
    select 1 from public.test_sites s
    where s.id = site_photos.site_id and s.organisation_id = current_org()));

alter policy aphoto_write on public.asset_photos
  using (can_edit() and exists (
    select 1 from public.sewage_assets a
    where a.id = asset_photos.asset_id and a.organisation_id = current_org()));

alter policy ira_write on public.info_request_assets
  using (can_edit() and exists (
    select 1 from public.info_requests r
    where r.id = info_request_assets.request_id and r.organisation_id = current_org()));

-- 2. WINEP links: the river being worked on, and editors only for writes
alter policy winep_asset_links_read on public.winep_asset_links
  using (organisation_id = current_org());

alter policy winep_asset_links_write on public.winep_asset_links
  using (can_edit() and organisation_id = current_org())
  with check (can_edit() and organisation_id = current_org());

-- 3. info_requests UPDATE
alter policy ir_update on public.info_requests
  using (can_edit() and organisation_id = current_org());
