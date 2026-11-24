-- 0110 — Reporting a river photo.
--
-- Replaces the "Report" mailto under each public photo with a form. Reports go to the photo's river
-- admins (members' Photos page) and to River Hub moderators, who keep or hide the photo.
--
-- * photo_reports — reason, optional note and reply email, a salted IP hash for rate limiting.
--   Only the photo's river admins and moderators can read or update them.
-- * submit_photo_report() (public) — approved photos only; one open report per reporter per photo;
--   10 reports per IP hash a day. Hides the photo at once when the reason is privacy (someone or their
--   home can be identified), or when three different reporters have open reports on it. A hidden-by-
--   reports photo is flagged so "Keep" can put it back; the app removes its public copy.
-- * resolve_photo_reports() — the river's admin or a moderator closes a photo's open reports as kept
--   or hidden (the app does the publishing or unpublishing).
-- * public_reportable_photo() — the caption and thumbnail shown on the report form.

alter table river_photos add column if not exists hidden_by_reports boolean not null default false;

do $$ begin
  create type photo_report_reason as enum ('privacy', 'wrong_place', 'not_theirs', 'offensive', 'other');
exception when duplicate_object then null; end $$;

create table if not exists photo_reports (
  id               uuid primary key default gen_random_uuid(),
  photo_id         uuid not null references river_photos(id) on delete cascade,
  organisation_id  uuid not null references organisations(id) on delete cascade,
  reason           photo_report_reason not null,
  note             text check (note is null or length(note) <= 1000),
  email            text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  status           text not null default 'pending' check (status in ('pending', 'kept', 'hidden')),
  ip_hash          text,
  decided_by       uuid references profiles(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists photo_reports_open_idx on photo_reports (organisation_id, status, created_at desc);
create index if not exists photo_reports_photo_idx on photo_reports (photo_id, status);

alter table photo_reports enable row level security;
revoke all on photo_reports from anon, authenticated;
grant select, update on photo_reports to authenticated;

drop policy if exists photo_reports_read on photo_reports;
create policy photo_reports_read on photo_reports for select
  using (is_moderator() or (is_admin() and organisation_id = current_org()));
drop policy if exists photo_reports_update on photo_reports;
create policy photo_reports_update on photo_reports for update
  using (is_moderator() or (is_admin() and organisation_id = current_org()))
  with check (is_moderator() or (is_admin() and organisation_id = current_org()));

-- The photo shown on the report form (approved photos only, no private paths).
create or replace function public_reportable_photo(p_photo uuid)
returns table (id uuid, organisation_id uuid, caption text, credit text, thumb_public_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.organisation_id, p.caption, p.credit, p.thumb_public_path
  from river_photos p join organisations o on o.id = p.organisation_id and o.live
  where p.id = p_photo and p.status = 'approved'
$$;

create or replace function submit_photo_report(
  p_photo uuid, p_reason photo_report_reason, p_note text, p_email text, p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_reporters int; v_hidden boolean := false;
begin
  select p.organisation_id into v_org
    from river_photos p join organisations o on o.id = p.organisation_id and o.live
   where p.id = p_photo and p.status = 'approved';
  if v_org is null then raise exception 'photo_not_found'; end if;
  if p_ip_hash is not null and exists (
       select 1 from photo_reports where photo_id = p_photo and ip_hash = p_ip_hash and status = 'pending') then
    raise exception 'already_reported';
  end if;
  if p_ip_hash is not null and (
       select count(*) from photo_reports where ip_hash = p_ip_hash and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into photo_reports (photo_id, organisation_id, reason, note, email, ip_hash)
  values (p_photo, v_org, p_reason, nullif(trim(p_note), ''), nullif(lower(trim(p_email)), ''), p_ip_hash)
  returning id into v_id;

  select count(distinct coalesce(ip_hash, id::text)) into v_reporters
    from photo_reports where photo_id = p_photo and status = 'pending';
  if p_reason = 'privacy' or v_reporters >= 3 then
    update river_photos set status = 'hidden', is_hero = false, hidden_by_reports = true
     where id = p_photo and status = 'approved';
    v_hidden := found;
  end if;
  return jsonb_build_object('id', v_id, 'organisation_id', v_org, 'auto_hidden', v_hidden);
end $$;

create or replace function resolve_photo_reports(p_photo uuid, p_outcome text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_org uuid; n int;
begin
  if p_outcome not in ('kept', 'hidden') then raise exception 'bad_outcome'; end if;
  select organisation_id into v_org from river_photos where id = p_photo;
  if v_org is null then raise exception 'photo_not_found'; end if;
  if not (is_moderator() or (is_admin() and v_org = current_org())) then raise exception 'not_allowed'; end if;
  update photo_reports set status = p_outcome, decided_by = auth.uid(), decided_at = now()
   where photo_id = p_photo and status = 'pending';
  get diagnostics n = row_count;
  update river_photos set hidden_by_reports = false where id = p_photo;
  return n;
end $$;

revoke all on function public_reportable_photo(uuid) from public;
grant execute on function public_reportable_photo(uuid) to anon, authenticated;
revoke all on function submit_photo_report(uuid, photo_report_reason, text, text, text) from public;
grant execute on function submit_photo_report(uuid, photo_report_reason, text, text, text) to anon, authenticated;
revoke all on function resolve_photo_reports(uuid, text) from public, anon;
grant execute on function resolve_photo_reports(uuid, text) to authenticated;
