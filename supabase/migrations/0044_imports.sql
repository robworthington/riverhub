-- River Hub — bulk result import (see IMPORT-TOOL-DESIGN.md). Audit table for upload batches +
-- a generic per-result context store; test_results.source_ref already has a unique index, which is
-- the idempotency key the loader upserts on.
create table if not exists imports (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  filename         text,
  format           text,                                  -- 'xlsx' | 'csv'
  site_id          uuid references test_sites(id) on delete set null,
  status           text not null default 'completed',     -- 'completed'
  rows_total       int,
  rows_imported    int,
  rows_updated     int,
  rows_error       int,
  uploaded_by      uuid references profiles(id),
  created_at       timestamptz not null default now()
);
create index if not exists imports_org_created_idx on imports (organisation_id, created_at desc);

alter table imports enable row level security;
create policy imports_read on imports for select using (organisation_id = current_org());
create policy imports_write on imports for all
  using (can_edit() and organisation_id = current_org())
  with check (can_edit() and organisation_id = current_org());

-- Recognised-but-unmodelled sample context (tide, 15-min rain, …) so new columns don't need a
-- migration each time; first-class columns stay for things we chart.
alter table test_results add column if not exists context   jsonb;
alter table test_results add column if not exists import_id uuid references imports(id) on delete set null;
