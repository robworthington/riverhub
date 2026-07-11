-- River Hub — API keys for the import API (see IMPORT-TOOL-DESIGN.md Phase 3 / IMPORT-API.md).
-- Only the SHA-256 hash is stored; the plaintext key is shown once at creation. The API route
-- authenticates with the service-role client and looks a key up by hash, so RLS here only governs
-- the admin management UI.
create table if not exists api_keys (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  name             text,
  key_prefix       text not null,          -- e.g. 'rvh_ab12' — for display only
  key_hash         text not null unique,   -- sha-256 hex of the full key
  scope            text not null default 'import',
  created_by       uuid references profiles(id),
  last_used_at     timestamptz,
  revoked          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists api_keys_org_idx on api_keys (organisation_id);

alter table api_keys enable row level security;
create policy api_keys_admin on api_keys for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());
