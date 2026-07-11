-- River Hub — saved import column-mappings (see IMPORT-TOOL-DESIGN.md, Phase 2).
-- A profile stores the column->role overrides keyed by a header signature, so re-uploading a file
-- with the same columns auto-applies the saved mapping.
create table if not exists import_profiles (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  name             text not null,
  header_signature text not null,          -- sorted, normalised header list
  mapping          jsonb not null,          -- { "<normalised header>": "<role string>" }
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  unique (organisation_id, header_signature)
);
alter table import_profiles enable row level security;
create policy import_profiles_read on import_profiles for select using (organisation_id = current_org());
create policy import_profiles_write on import_profiles for all
  using (can_edit() and organisation_id = current_org())
  with check (can_edit() and organisation_id = current_org());
