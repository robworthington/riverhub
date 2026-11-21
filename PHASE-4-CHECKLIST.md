# River Hub — Phase 4 cutover: setup checklist & data load

Working checklist for standing up the national deployment and loading Dart + Teign, per `PHASE-1-CUTOVER-RUNBOOK.md` (workstreams F1–F5). Nothing here is destructive until the DNS cutover in F5. The national code is on `main`; the live instances deploy from `release-v1`.

## Prerequisites — gather these first

```bash
# Connection strings (session pooler, port 5432) and org ids
DART_DB_URL="postgresql://…dart-instance…"          # existing Dart Supabase
TEIGN_DB_URL="postgresql://…teign-instance…"         # existing Teign Supabase
NATIONAL_DB_URL="postgresql://…riverhub-national…"   # new, created in A1
DART_ORG="00000000-0000-0000-0000-000000000001"
TEIGN_ORG="…"                                        # run `select id from organisations;` on TEIGN_DB_URL
```

---

## A. Stand up the national database (F1)

- [ ] **A1.** Create the **`riverhub-national` Supabase project** (region London / `eu-west-2`). Record: project ref, DB pooler URL, `anon` key, `service_role` key, Storage URL.
- [ ] **A2.** Apply all migrations `0001→0090` to the empty DB. Cleanest with the Supabase CLI linked to the new project:
  ```bash
  supabase link --project-ref <national-ref>
  supabase db push                 # applies supabase/migrations/* in order
  ```
  Fallback without the CLI:
  ```bash
  cat supabase/migrations/*.sql | docker run --rm -i postgres:16 psql "$NATIONAL_DB_URL" -v ON_ERROR_STOP=1
  ```
- [ ] **A3.** Verify the clean empty instance:
  ```sql
  select count(*) from organisations;                 -- expect 0
  select count(*) from pg_proc where proname like 'public_%';  -- RPCs present
  select * from national_summary();                   -- runs, 0 rivers
  select id from storage.buckets where id='evidence'; -- bucket exists (from 0002)
  ```

## B. Deploy `riverhub-national` (F3)

- [ ] **B1.** New Vercel project from the `riverhub` repo, **Production Branch = `main`**. Do **not** attach a vanity domain yet — use the Vercel URL.
- [ ] **B2.** Environment variables:
  ```
  NEXT_PUBLIC_SUPABASE_URL        = <national project URL>
  NEXT_PUBLIC_SUPABASE_ANON_KEY   = <national anon key>
  SUPABASE_SERVICE_ROLE_KEY       = <national service_role key>
  NEXT_PUBLIC_MODE                = national
  NEXT_PUBLIC_DEFAULT_RIVER       = dart
  NEXT_PUBLIC_HOST_RIVERS         = {"riverhub.friendsofthedart.org":"dart","<teign-public-host>":"teign"}
  CRON_SECRET                     = <fresh secret>
  # optional: NEXT_PUBLIC_UMAMI_* (national site id)
  # NOTE: capacityResponse is now per-river (migration 0090, set on the org row) — no env var needed.
  ```
- [ ] **B3.** Confirm the hourly cron (`vercel.json`) points at the national deployment.
- [ ] **B4.** Deploy; smoke-test on staging **after** the data load: `/` (summary+chooser), `/r/dart/explore/spills`, `/r/teign/explore/spills`, an asset dossier, councils, ea-monitoring.

## C. Load Dart + Teign data (F2)

Re-derive the table buckets on the day with the runbook's Appendix B. `profile_orgs` (B4 members) is **deferred with auth**.

**C1 — shared reference, load ONCE from Dart:**
```bash
docker run --rm postgres:16 pg_dump "$DART_DB_URL" --data-only --no-owner --no-privileges \
  --table=public.parishes  > ref_parishes.sql
# verify river_segments: if no organisation_id and identical across instances, add here; else per-org
```

**C2 — per-org tables, load from BOTH (disjoint by org, UUID-keyed):**
```bash
TABLES="--table=public.organisations \
 --table=public.water_bodies --table=public.river_gauges --table=public.wastewater_catchments \
 --table=public.rainfall_stations --table=public.rainfall_readings --table=public.flow_readings \
 --table=public.sewage_systems --table=public.sewage_assets --table=public.asset_permits \
 --table=public.system_assumptions --table=public.protected_areas \
 --table=public.spill_events --table=public.edm_snapshots --table=public.edm_annual_stats \
 --table=public.emergency_overflows --table=public.eo_annual_spills \
 --table=public.test_types --table=public.test_sites --table=public.test_results \
 --table=public.ea_wq_samples --table=public.ea_wq_stats \
 --table=public.winep_actions --table=public.winep_asset_links"

docker run --rm postgres:16 pg_dump "$DART_DB_URL"  --data-only --no-owner --no-privileges $TABLES > dart_orgdata.sql
docker run --rm postgres:16 pg_dump "$TEIGN_DB_URL" --data-only --no-owner --no-privileges $TABLES > teign_orgdata.sql
```

**C3 — child-of-org, load from BOTH:**
```bash
docker run --rm postgres:16 pg_dump "$DART_DB_URL"  --data-only --no-owner --no-privileges --table=public.asset_photos --table=public.site_photos > dart_photos.sql
docker run --rm postgres:16 pg_dump "$TEIGN_DB_URL" --data-only --no-owner --no-privileges --table=public.asset_photos --table=public.site_photos > teign_photos.sql
```

**C4 — load into national in FK order** (reference → org rows+data → child), FK checks deferred:
```bash
for f in ref_parishes.sql dart_orgdata.sql teign_orgdata.sql dart_photos.sql teign_photos.sql; do
  { echo "begin; set constraints all deferred;"; cat "$f"; echo "commit;"; } \
    | docker run --rm -i postgres:16 psql "$NATIONAL_DB_URL" -v ON_ERROR_STOP=1
done
```
- A `parishes` duplicate-key means the Teign dump also carried it — re-dump without it.
- Big files (spill_events / edm_snapshots / rainfall_readings) can go via the `~/teign-import` Node runner if the pipe is slow.

## D. Per-river config (F2)

```sql
-- DART
update organisations set
  river_slug='dart', region='South West', live=true,
  river_name='River Dart', portal_name='River Dart Data', company_name='South West Water',
  logo_url='/fod-mark.png',
  marketing_url='https://www.friendsofthedart.org',
  donate_url='https://www.paypal.com/donate/?hosted_button_id=SQ6XYEF4CS37S',
  map_centre_lat=50.45, map_centre_lng=-3.72, map_zoom=11,
  capacity_response=true,
  edm_feed_url='https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query',
  edm_feed_kind='arcgis_edm'
where id='00000000-0000-0000-0000-000000000001';

-- TEIGN (pull bracketed values from the Teign instance's Vercel env: NEXT_PUBLIC_RIVER_NAME, _PORTAL_NAME,
-- _LOGO_URL, _MARKETING_URL, _DONATE_URL, _MAP_CENTRE, _MAP_ZOOM, _CAPACITY_RESPONSE)
update organisations set
  river_slug='teign', region='South West', live=true,
  river_name='River Teign', portal_name='River Teign Data', company_name='South West Water',
  logo_url='[NEXT_PUBLIC_LOGO_URL]', marketing_url='[NEXT_PUBLIC_MARKETING_URL]', donate_url='[NEXT_PUBLIC_DONATE_URL]',
  map_centre_lat=[lat], map_centre_lng=[lng], map_zoom=[zoom],
  capacity_response=[true/false],
  edm_feed_url='https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query',
  edm_feed_kind='arcgis_edm'
where id='[TEIGN_ORG]';

notify pgrst, 'reload schema';
```

## E. Verify before cutover

- [ ] **E1.** Row-count reconciliation per org (instance vs national-filtered-by-org must match):
  ```sql
  -- on an instance:
  select 'assets' t,count(*) from sewage_assets union all select 'spills',count(*) from spill_events
  union all select 'snapshots',count(*) from edm_snapshots union all select 'winep',count(*) from winep_actions
  union all select 'results',count(*) from test_results union all select 'ea_wq',count(*) from ea_wq_samples;
  -- on national (expect equality for that org):
  select 'assets' t,count(*) from sewage_assets where organisation_id='<ORG>' union all
  select 'spills',count(*) from spill_events where organisation_id='<ORG>' union all
  select 'snapshots',count(*) from edm_snapshots where organisation_id='<ORG>' union all
  select 'winep',count(*) from winep_actions where organisation_id='<ORG>' union all
  select 'results',count(*) from test_results where organisation_id='<ORG>' union all
  select 'ea_wq',count(*) from ea_wq_samples where organisation_id='<ORG>';
  ```
- [ ] **E2.** `select river_slug, portal_name, capacity_response, edm_feed_kind from organisations;` → dart + teign, branded + fed.
- [ ] **E3.** `select * from national_summary();` → 2 rivers; `national_rivers()` lists both.
- [ ] **E4.** Trigger the national cron once → `totalSnapshots>0`, no errors, both feeds resolved.
- [ ] **E5.** Page parity: diff `/r/dart` and `/r/teign` on staging vs the live instances (runbook F4).

Then F5: point the vanity domains at `riverhub-national`, verify, retire the instances + `release-v1`.

## Notes that bite if missed

1. **Storage files.** `asset_photos`/`site_photos` load the *rows*; the evidence images live in each instance's Storage `evidence` bucket and must be copied to the national project separately (Supabase Storage / S3 API) — not in the SQL dump.
2. **Members/auth deferred.** Do not load `profiles`, `profile_orgs`, or `auth.users` — public portal only. Members stay on their instance apps until a separate auth migration.
3. **`parishes` once.** Loading from both instances collides on the shared UUIDs.
4. **De-risk early (optional):** applying `0081→0090` to the live Dart/Teign DBs is additive and instance-safe, and makes the F2 load a same-schema copy.
