-- 0114: lock down winep_import_log (Supabase advisor: rls_disabled_in_public).
-- import_winep.py creates this per-run review log on first use; on the national DB that was the
-- Wessex batch (24 Nov 2026). Without RLS the public anon key could read, insert, update and
-- delete it. Only the loader (postgres, the table owner) and admins via the service role use it,
-- so: RLS on with no policies, and no table rights for anon/authenticated.
create table if not exists public.winep_import_log (
  id               uuid primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  organisation_id  uuid,
  cycle            text,
  source           text,
  action_id        text,
  action_component text,
  action_name      text,
  driver_code      text,
  driver_label     text,
  completion_date  date,
  water_company    text,
  reason           text
);
alter table public.winep_import_log enable row level security;
revoke all on public.winep_import_log from anon, authenticated;
