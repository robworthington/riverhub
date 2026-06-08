-- River Hub — asset photos + permit attachments

create table asset_photos (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references sewage_assets(id) on delete cascade,
  storage_path text not null,
  caption      text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index on asset_photos (asset_id);

alter table asset_permits add column if not exists permit_doc_path text;
alter table asset_permits add column if not exists permit_url text;

-- RLS: any org member may read/write photos for assets in their org
alter table asset_photos enable row level security;
create policy aphoto_read on asset_photos for select using (
  exists (select 1 from sewage_assets s where s.id = asset_photos.asset_id and s.organisation_id = current_org())
);
create policy aphoto_write on asset_photos for all using (
  exists (select 1 from sewage_assets s where s.id = asset_photos.asset_id and s.organisation_id = current_org())
) with check (
  exists (select 1 from sewage_assets s where s.id = asset_photos.asset_id and s.organisation_id = current_org())
);
