-- River Hub — deeper EDM history:
--   1. edm_snapshots → per-capture (sub-daily) instead of one row per day
--   2. spill_events  → discrete reconstructed events (start/end/duration)
--   3. edm_annual_stats → multi-year stats backfilled from EA Annual Returns

-- ---------- 1. snapshots: capture-level history ----------
alter table edm_snapshots add column if not exists captured_at timestamptz;
update edm_snapshots
  set captured_at = coalesce(fetched_at, (snapshot_date::timestamptz + interval '6 hours'))
  where captured_at is null;
alter table edm_snapshots alter column captured_at set not null;

alter table edm_snapshots drop constraint if exists edm_snapshots_asset_id_snapshot_date_key;
alter table edm_snapshots add constraint edm_snapshots_asset_captured_key unique (asset_id, captured_at);
create index if not exists edm_snapshots_asset_captured_idx on edm_snapshots (asset_id, captured_at desc);

-- ---------- 2. discrete spill events ----------
create table spill_events (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id),
  asset_id         uuid not null references sewage_assets(id) on delete cascade,
  outlet_id        text not null,
  event_start      timestamptz not null,
  event_end        timestamptz,
  ongoing          boolean not null default false,
  duration_minutes integer generated always as (
    case when event_end is not null and event_end > event_start
         then (extract(epoch from (event_end - event_start)) / 60)::int
         else null end
  ) stored,
  source           text not null default 'sww-edm-feed',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (asset_id, event_start)
);
create index on spill_events (asset_id, event_start desc);
create index on spill_events (organisation_id);

-- ---------- 3. annual stats (EA Annual Returns) ----------
create table edm_annual_stats (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references organisations(id),
  asset_id             uuid references sewage_assets(id) on delete set null,
  outlet_id            text not null,
  year                 integer not null,
  spill_count          numeric,
  total_duration_hours numeric,
  reporting_pct        numeric,
  site_name            text,
  source               text not null default 'ea-edm-annual-return',
  created_at           timestamptz not null default now(),
  unique (organisation_id, outlet_id, year)
);
create index on edm_annual_stats (asset_id, year);
create index on edm_annual_stats (organisation_id);

-- ---------- RLS ----------
alter table spill_events     enable row level security;
alter table edm_annual_stats enable row level security;

create policy se_read on spill_events for select using (organisation_id = current_org());
create policy se_admin_write on spill_events for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());

create policy eas_read on edm_annual_stats for select using (organisation_id = current_org());
create policy eas_admin_write on edm_annual_stats for all
  using (is_admin() and organisation_id = current_org())
  with check (is_admin() and organisation_id = current_org());
