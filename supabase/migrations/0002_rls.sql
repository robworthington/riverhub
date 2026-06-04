-- River Hub — M1 row-level security
-- Everyone is scoped to their organisation. Volunteers + admins may CRUD
-- sites/results/photos; only admins manage test types and profiles.

-- ---------- Helpers ----------
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organisation_id from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  )
$$;

-- ---------- Enable RLS ----------
alter table organisations enable row level security;
alter table profiles      enable row level security;
alter table water_bodies  enable row level security;
alter table parishes      enable row level security;
alter table test_types    enable row level security;
alter table test_sites    enable row level security;
alter table site_photos   enable row level security;
alter table test_results  enable row level security;

-- ---------- organisations ----------
create policy org_read on organisations for select
  using (id = current_org());

-- ---------- profiles ----------
create policy profiles_read on profiles for select
  using (organisation_id = current_org());
create policy profiles_admin_write on profiles for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- water_bodies (org-scoped reference) ----------
create policy wb_read on water_bodies for select
  using (organisation_id = current_org());
create policy wb_admin_write on water_bodies for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- parishes (shared reference data) ----------
create policy parish_read on parishes for select
  using (auth.role() = 'authenticated');
-- no user write policy: seeded via migration / service role only.

-- ---------- test_types (admin-managed) ----------
create policy tt_read on test_types for select
  using (organisation_id = current_org());
create policy tt_admin_write on test_types for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- ---------- test_sites (volunteers + admins) ----------
create policy site_read on test_sites for select
  using (organisation_id = current_org());
create policy site_write on test_sites for all
  using (organisation_id = current_org())
  with check (organisation_id = current_org());

-- ---------- site_photos ----------
create policy photo_read on site_photos for select
  using (exists (
    select 1 from test_sites s
    where s.id = site_photos.site_id and s.organisation_id = current_org()
  ));
create policy photo_write on site_photos for all
  using (exists (
    select 1 from test_sites s
    where s.id = site_photos.site_id and s.organisation_id = current_org()
  ))
  with check (exists (
    select 1 from test_sites s
    where s.id = site_photos.site_id and s.organisation_id = current_org()
  ));

-- ---------- test_results (volunteers + admins) ----------
create policy result_read on test_results for select
  using (organisation_id = current_org());
create policy result_write on test_results for all
  using (organisation_id = current_org())
  with check (organisation_id = current_org());

-- ---------- Storage: private 'evidence' bucket ----------
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- Authenticated users may upload/read within the bucket; org-scoping and
-- signed-URL reads are enforced at the application layer (server actions).
create policy "evidence authenticated read" on storage.objects for select
  to authenticated using (bucket_id = 'evidence');
create policy "evidence authenticated insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'evidence');
