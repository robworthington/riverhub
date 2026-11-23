-- River Hub — river photos (design canvas "River photos: upload, clean, approve, show").
--
-- A river's group uploads photos of its river. The browser strips location and camera data and
-- resizes before upload, so only cleaned copies are ever stored. Uploads land in the private
-- 'evidence' bucket as "pending"; when a group admin approves one, the server copies it into the
-- public 'river-photos' bucket and the public pages show it, credited and licensed. Hiding or
-- deleting removes the public copy. Only approved photos are visible to anyone outside the group.

create table if not exists river_photos (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id) on delete cascade,
  asset_id            uuid references sewage_assets(id) on delete set null,  -- optional: an overflow or works
  caption             text not null check (length(trim(caption)) > 0),
  place               text,
  taken_on            date,
  credit              text not null check (length(trim(credit)) > 0),
  licence             text not null default 'cc_by_4' check (licence in ('cc_by_4', 'river_hub_only')),
  consent             boolean not null check (consent),       -- "I took this, and anyone identifiable agreed"
  status              text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  is_hero             boolean not null default false,          -- the river's lead photo
  private_path        text not null,                           -- evidence/photos/<org>/<id>/large.jpg
  thumb_private_path  text not null,
  public_path         text,                                    -- river-photos/<org>/<id>/large.jpg, set on approval
  thumb_public_path   text,
  width               int,
  height              int,
  uploaded_by         uuid references profiles(id),
  approved_by         uuid references profiles(id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (not is_hero or status = 'approved'),
  check (status <> 'approved' or public_path is not null)
);
create index if not exists river_photos_org_idx on river_photos (organisation_id, status);
create index if not exists river_photos_asset_idx on river_photos (asset_id) where asset_id is not null;
create unique index if not exists river_photos_one_hero on river_photos (organisation_id) where is_hero;

-- One hero per river: choosing a new one clears the old. Keeps updated_at fresh.
create or replace function river_photos_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.is_hero and (tg_op = 'INSERT' or not old.is_hero) then
    update river_photos set is_hero = false
      where organisation_id = new.organisation_id and is_hero and id <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists river_photos_touch on river_photos;
create trigger river_photos_touch before insert or update on river_photos
  for each row execute function river_photos_touch();

-- ---------- RLS ----------

alter table river_photos enable row level security;

-- Members see all of their river's photos (pending ones included, to review them).
drop policy if exists rp_read on river_photos;
create policy rp_read on river_photos for select using (organisation_id = current_org());

-- Admins and volunteers upload; an upload always starts pending, with no public copy and not the hero.
drop policy if exists rp_insert on river_photos;
create policy rp_insert on river_photos for insert with check (
  can_edit() and organisation_id = current_org()
  and status = 'pending' and not is_hero and public_path is null and thumb_public_path is null
  and uploaded_by = auth.uid());

-- Only admins approve, hide, choose the hero or edit.
drop policy if exists rp_update on river_photos;
create policy rp_update on river_photos for update
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

-- Admins delete any; the uploader can withdraw their own while it is still pending.
drop policy if exists rp_delete on river_photos;
create policy rp_delete on river_photos for delete using (
  organisation_id = current_org()
  and (is_admin() or (uploaded_by = auth.uid() and status = 'pending')));

revoke all on river_photos from anon;
grant select, insert, update, delete on river_photos to authenticated;

-- ---------- storage ----------

-- Public bucket for approved photos only (resized JPEGs, 5 MB cap).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('river-photos', 'river-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only admins write to it (the approve action copies from evidence); anyone may read (public bucket).
drop policy if exists "river-photos admin insert" on storage.objects;
create policy "river-photos admin insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'river-photos' and is_admin());
drop policy if exists "river-photos admin update" on storage.objects;
create policy "river-photos admin update" on storage.objects for update
  to authenticated using (bucket_id = 'river-photos' and is_admin());
drop policy if exists "river-photos admin delete" on storage.objects;
create policy "river-photos admin delete" on storage.objects for delete
  to authenticated using (bucket_id = 'river-photos' and is_admin());

-- The evidence bucket had read and insert policies but no delete, so removing a file (a deleted
-- request's documents, a withdrawn photo) silently failed. Admins may delete; uploaders may delete
-- their own pending photo files.
drop policy if exists "evidence admin delete" on storage.objects;
create policy "evidence admin delete" on storage.objects for delete
  to authenticated using (bucket_id = 'evidence' and (is_admin() or owner_id = auth.uid()::text));

-- ---------- public read ----------

-- A river's approved photos (optionally only those of one overflow), hero first, newest next.
create or replace function public_river_photos(p_org uuid, p_asset uuid default null)
returns table (
  id uuid, asset_id uuid, caption text, place text, taken_on date, credit text, licence text,
  public_path text, thumb_public_path text, width int, height int, is_hero boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.asset_id, p.caption, p.place, p.taken_on, p.credit, p.licence,
         p.public_path, p.thumb_public_path, p.width, p.height, p.is_hero
  from river_photos p
  join organisations o on o.id = p.organisation_id and o.live
  where p.organisation_id = p_org and p.status = 'approved'
    and (p_asset is null or p.asset_id = p_asset)
  order by p.is_hero desc, coalesce(p.taken_on, p.created_at::date) desc, p.created_at desc
$$;

revoke all on function river_photos_touch() from public, anon, authenticated;
grant execute on function public_river_photos(uuid, uuid) to anon, authenticated;
