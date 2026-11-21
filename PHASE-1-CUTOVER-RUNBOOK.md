# River Hub — Phase 1 cutover runbook (workstream F)

**Status:** draft for review · **Parent:** `PHASE-1-PLAN.md` (workstream F) · **Scope:** migrate the Dart + Teign **public portals** onto one national deployment, in parallel, with a DNS-reversible cutover.

This runbook is the ops procedure for F. It assumes the code stack **#11–#17** (migrations `0081`–`0087`: de-single-org + `/r/<river>` routing + runtime branding + national summary + feed-driven sync) is merged to `main`. Nothing here is destructive until **F5**, and F5 is a DNS change you can reverse in minutes.

---

## 0. Principles & what "done" looks like

- **Additive, parallel, reversible.** The live Dart and Teign instances keep running untouched on their own Supabase + Vercel projects throughout F1–F4. The national deployment is built alongside them against a **separate national database**. Cutover (F5) is repointing DNS; rollback is pointing it back.
- **One database, one deploy, many rivers.** After cutover, `riverhub-national` (Vercel, `main`, `MODE=national`) serves every river from one national Supabase DB. Each river is one `organisations` row carrying its `river_slug`, branding and `edm_feed_url`.
- **Done when:** `/r/dart` and `/r/teign` on the national deployment match the live instances page-for-page; the hourly sync is green for both; the vanity domains resolve to their river on the national app; the two instance projects are retired.

### Pre-flight checklist
- [ ] Stack #11–#17 merged to `main`; `main` builds green (`next build`).
- [ ] You can `pg_dump` each instance's Supabase DB (connection string / session-pooler, port 5432) and run SQL against the national DB (psql, or the `~/teign-import` Node runner for large files — no local `psql` required).
- [ ] You have each instance's **public** vanity host and its DNS provider access:
      - Dart: `riverhub.friendsofthedart.org`
      - Teign: _<fill: the Teign public host>_
- [ ] You have each instance's Vercel env (`NEXT_PUBLIC_*`) to copy per-river branding values from (see Appendix A).
- [ ] A low-traffic cutover window is agreed (the hourly cron writes continuously; cut over just **after** a sync tick).

### Vanity-domain prerequisite (small code task before F3)
Today the middleware resolves the river from the **`/r/<slug>` path**; it does not map a bare vanity host (`riverhub.friendsofthedart.org/`) to a river. Pick one before F3:
- **(A, recommended) Host→river map.** Add a `host` lookup in the middleware: match the request host to a river slug (a small map, or an `organisations.host` column) and rewrite `/` and `/explore/*` on that host to `/r/<slug>/…` (reusing the existing redirect logic). ~1 middleware function; ship as a small PR on `main`.
- **(B, zero-code) Redirect the apex.** Leave vanity hosts as redirectors: `riverhub.friendsofthedart.org/*` → `national.<domain>/r/dart/*` at the DNS/hosting layer. Simplest, but the river then lives on the national domain, not the vanity host.

---

## F1 — Stand up the national database

1. **Create the national Supabase project** (`riverhub-national`). Note its project ref, DB connection string, `anon` and `service_role` keys, and the Storage URL.
2. **Apply the full migration sequence** `0001 → 0087` in order to the empty DB. This gives a clean, empty national instance (the "apply full sequence → clean empty instance" property; verified against a bootstrapped scratch DB during the build).
   - The per-river backfills inside `0081`/`0085`/`0087` (set Dart `river_slug`, SWW `edm_feed_url`) are **no-ops here** — there are no `organisations` rows yet. Per-river config is set explicitly in **F2 step 4**.
   - The `evidence` Storage bucket + its RLS come from `0002`; confirm the bucket exists.
3. **Verify empty-instance health:**
   ```sql
   select count(*) from organisations;        -- expect 0
   select count(*) from pg_proc where proname like 'public_%';  -- RPCs present
   select national_summary();                 -- runs, returns 0 rivers (no data yet)
   ```

---

## F2 — Load the Dart + Teign data

The schema is fully org-scoped, so loading is a per-table union of the two instances — **except** shared reference data (load once) and single-tenant config (skip). Work on a **snapshot** of each instance DB (a `pg_dump` taken at the start of the window), not the live DB.

### Table buckets (re-derive with the query in Appendix B before loading — the schema may have grown)

**Load from BOTH instances** (rows carry `organisation_id`, so the two sets are disjoint and UUID-keyed — no collisions):
`water_bodies`, `river_gauges`, `rainfall_stations`, `rainfall_readings`, `flow_readings`, `wastewater_catchments`, `sewage_systems`, `sewage_assets`, `asset_permits`, `system_assumptions`, `spill_events`, `edm_snapshots`, `edm_annual_stats`, `emergency_overflows`, `eo_annual_spills`, `protected_areas`, `test_types`, `test_sites`, `test_results`, `ea_wq_samples`, `ea_wq_stats`, `winep_actions`, `winep_asset_links`.

**Load from BOTH** (no `organisation_id` but a FK to org-scoped parents; still disjoint by UUID):
`asset_photos`, `site_photos`.

**Load ONCE, from Dart only** (shared national reference, identical UUIDs across instances):
`parishes`. _Verify `river_segments`_ with Appendix B — if it is shared reference load once; if it FKs org-scoped data, load from both.

**Load both org rows:** `organisations` (two rows).

**Skip:** `app_config` (single-tenant `public_org()` pointer; the national portal uses `p_org`, not `public_org()`, so it stays unset). `spatial_ref_sys` (PostGIS, already present).

**Members / auth — deferred (see note at end of F2).**

### Load procedure
1. **Dump each instance (data-only, no ownership/privileges), per bucket.** Example for the per-org tables, Dart:
   ```bash
   pg_dump "$DART_DB_URL" --data-only --no-owner --no-privileges \
     --table=public.water_bodies --table=public.sewage_systems --table=public.sewage_assets \
     --table=public.spill_events --table=public.edm_snapshots --table=public.winep_actions \
     --table=public.winep_asset_links --table=public.asset_permits --table=public.system_assumptions \
     --table=public.emergency_overflows --table=public.eo_annual_spills --table=public.edm_annual_stats \
     --table=public.rainfall_stations --table=public.rainfall_readings --table=public.flow_readings \
     --table=public.river_gauges --table=public.wastewater_catchments --table=public.protected_areas \
     --table=public.test_types --table=public.test_sites --table=public.test_results \
     --table=public.ea_wq_samples --table=public.ea_wq_stats \
     --table=public.organisations \
     > dart_orgdata.sql
   # Repeat for Teign (TEIGN_DB_URL) -> teign_orgdata.sql, WITHOUT --table=public.organisations? No:
   # include organisations for Teign too (its one row). Exclude parishes from BOTH here.
   ```
   Shared reference, Dart only:
   ```bash
   pg_dump "$DART_DB_URL" --data-only --no-owner --no-privileges \
     --table=public.parishes  > ref_parishes.sql
   ```
   Child-of-org, both:
   ```bash
   pg_dump "$DART_DB_URL"  --data-only --no-owner --no-privileges --table=public.asset_photos --table=public.site_photos > dart_photos.sql
   pg_dump "$TEIGN_DB_URL" --data-only --no-owner --no-privileges --table=public.asset_photos --table=public.site_photos > teign_photos.sql
   ```
2. **Load into the national DB in FK order:** reference first, then org rows, then per-org data, then child data.
   ```
   ref_parishes.sql  →  (organisations rows)  →  dart_orgdata.sql  →  teign_orgdata.sql  →  photos
   ```
   `pg_dump` orders tables by dependency within a file, but across files load parents first. If an FK ordering error appears, load that one table after its parent, or wrap the load in a single transaction with `SET session_replication_role = replica;` (defers FK checks) and set it back after.
   - Large files (spill_events, edm_snapshots, rainfall_readings) via the `~/teign-import` Node runner if `psql` is unavailable.
3. **Guard against double-loading reference data.** `parishes` loads once. If a `duplicate key` error appears on `parishes`, it means Teign's dump also carried them — it should not be in the Teign file. Re-dump Teign excluding `parishes`.
4. **Set per-river config on each org** (the migrations couldn't, since the rows didn't exist at F1). Use Appendix A values:
   ```sql
   -- Dart
   update organisations set
     river_slug='dart', region='South West', live=true,
     river_name='River Dart', portal_name='River Dart Data', company_name='South West Water',
     logo_url='/fod-mark.png',
     marketing_url='https://www.friendsofthedart.org',
     donate_url='https://www.paypal.com/donate/?hosted_button_id=SQ6XYEF4CS37S',
     map_centre_lat=50.45, map_centre_lng=-3.72, map_zoom=11,
     edm_feed_url='https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query',
     edm_feed_kind='arcgis_edm'
   where id = '00000000-0000-0000-0000-000000000001';

   -- Teign (fill values from the Teign instance's Vercel env — Appendix A)
   update organisations set
     river_slug='teign', region='South West', live=true,
     river_name='River Teign', portal_name='River Teign Data', company_name='South West Water',
     logo_url= '<NEXT_PUBLIC_LOGO_URL>', marketing_url='<NEXT_PUBLIC_MARKETING_URL>',
     donate_url='<NEXT_PUBLIC_DONATE_URL>',
     map_centre_lat=<lat>, map_centre_lng=<lng>, map_zoom=<zoom>,
     edm_feed_url='https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query',
     edm_feed_kind='arcgis_edm'
   where id = '<TEIGN_ORG_ID>';
   ```
5. **Reconcile row counts** (Appendix C) between each source instance and the national DB, per org, for the high-value tables. They must match exactly.
6. **Reload PostgREST schema cache:** `notify pgrst, 'reload schema';` (and/or restart the REST service).

**Members / auth (deferred, safe):** `profiles` FKs `auth.users`, which does not migrate trivially between Supabase projects, and the **members app runs on a different host** from the public vanity domains. Phase-1 cutover moves the **public portal only**; members keep logging in on their existing instance apps. Consolidating members onto the national project (auth export/import + `profiles` load) is a separate step, aligned with the members river-switcher (plan workstream B4). Do **not** load `profiles` without first migrating the matching `auth.users`.

---

## F3 — Deploy the national app

1. **Create the `riverhub-national` Vercel project** from `main`.
2. **Environment:**
   - `NEXT_PUBLIC_MODE=national`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → the **national** project.
   - `CRON_SECRET` → a fresh secret; wire the hourly cron (`vercel.json`) exactly as the instances do.
   - `NEXT_PUBLIC_DEFAULT_RIVER` → only affects the legacy `/explore` and bare `/` on non-vanity hosts; set to `dart` or leave default.
   - Analytics (`NEXT_PUBLIC_UMAMI_*`) → a national site id, or leave off initially.
3. **Deploy to a staging domain** (e.g. `national.<domain>` or the Vercel preview URL). Do **not** point any vanity domain yet.
4. **Smoke test on staging:** `/` (summary + chooser), `/r/dart/explore/spills`, `/r/teign/explore/spills`, an asset dossier, councils, EA monitoring. Confirm branding differs per river and data is scoped.
5. **Apply the vanity-domain prerequisite** (section 0): host→river map (A) or apex redirect (B).

---

## F4 — Parallel run & parity

Both the live instances and the national staging deployment are now up. Verify equivalence **before** touching DNS.

1. **Per-river page parity.** For each river, compare the national `/r/<slug>/…` against the live instance `/explore/…`, page by page:
   - [ ] Spills board (counts, statuses, "last sync" age)
   - [ ] Gaps (count + ranking)
   - [ ] Why / dry / before-works / capacity
   - [ ] Measures + reduction tracker
   - [ ] Emergency overflows
   - [ ] Map (pins + statuses)
   - [ ] An asset dossier (pick the worst-offender) + an event evidence page
   - [ ] Councils (district/parish counts) + EA monitoring (site + a sample series)
   - Numbers must match the live instance (the national pages run the same RPCs with `p_org`). Investigate any divergence before cutover — a mismatch usually means a missed table in F2 or stale data.
2. **Sync smoke test.** Trigger the national cron once (`curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/cron/edm-sync`). Expect: `totalSnapshots > 0`, no `edm.errors`, one snapshot per monitored asset per org. Confirm both orgs' `edm_feed_url` resolved (feed-driven).
3. **Performance.** National summary `/` loads under the 3 s anon timeout with both rivers' data. (At two rivers this is comfortable; revisit with A3 materialised views before many rivers.)
4. **Agree rollback** (section F5) and who executes it.

---

## F5 — Cutover & rollback

**Cutover (per river, one at a time — start with the lower-traffic river):**
1. Lower the DNS TTL on the vanity host(s) to 300 s a day ahead.
2. Just **after** an hourly sync tick, repoint the vanity host to the national deployment:
   - Host→river map (A): point `riverhub.friendsofthedart.org` at `riverhub-national`; the middleware maps the host to `dart`.
   - Apex redirect (B): point it at the redirector → `national/r/dart`.
3. Verify on the real host: live board, a dossier, and that the next cron tick writes fresh snapshots to the **national** DB.
4. Repeat for Teign.
5. Leave both instance projects **running but unreferenced** for the agreed soak (e.g. 1–2 weeks).

**Rollback (any time before retirement):** point the vanity host's DNS back at its original instance. The instance DB kept receiving its own cron writes the whole time (it was never stopped), so it is current — rollback is just DNS. If you want to stop double-syncing during the soak, disable the **instance** cron (not the DB) once national is serving.

**Retirement (after a clean soak):**
- [ ] Disable the instance Vercel crons, then the instance projects.
- [ ] Snapshot/export the instance Supabase DBs, then decommission them.
- [ ] Update the instance registry / `config/catchments` notes to point at the national project.
- [ ] Remove the now-unused instance env/config.

---

## Appendices

### A. Per-river config values
- **Dart** — in the SQL above (these are the `INSTANCE` defaults in `src/lib/instance.ts`).
- **Teign** — copy from the Teign instance's Vercel env: `NEXT_PUBLIC_RIVER_NAME`, `NEXT_PUBLIC_PORTAL_NAME`, `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_DONATE_URL`, `NEXT_PUBLIC_MAP_CENTRE` (→ lat/lng), `NEXT_PUBLIC_MAP_ZOOM`, and `NEXT_PUBLIC_CAPACITY_RESPONSE` if set. Get the Teign org id with `select id from organisations;` on the Teign DB.

### B. Re-derive the table buckets on the day
```sql
-- per-org tables (load both rivers)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organisation_id' and not a.attisdropped)
order by 1;
-- no-org tables (classify each: shared-reference=load once, child-of-org=load both, skip)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and not exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organisation_id' and not a.attisdropped)
  and c.relname not like 'spatial_%'
order by 1;
```
For each no-org table, check its FKs (`\d+ <table>`): a FK to an org-scoped table ⇒ load both; no such FK and identical across instances ⇒ load once; single-tenant pointer (`app_config`) ⇒ skip.

### C. Row-count reconciliation (run on each source instance, then on national filtered by org)
```sql
-- on an instance DB (one org):
select 'sewage_assets' t, count(*) from sewage_assets
union all select 'spill_events', count(*) from spill_events
union all select 'edm_snapshots', count(*) from edm_snapshots
union all select 'winep_actions', count(*) from winep_actions
union all select 'test_results', count(*) from test_results
union all select 'ea_wq_samples', count(*) from ea_wq_samples;

-- on national (expect instance_count == national_count for that org):
select 'sewage_assets' t, count(*) from sewage_assets where organisation_id = '<ORG_ID>'
union all select 'spill_events', count(*) from spill_events where organisation_id = '<ORG_ID>'
union all select 'edm_snapshots', count(*) from edm_snapshots where organisation_id = '<ORG_ID>'
union all select 'winep_actions', count(*) from winep_actions where organisation_id = '<ORG_ID>'
union all select 'test_results', count(*) from test_results where organisation_id = '<ORG_ID>'
union all select 'ea_wq_samples', count(*) from ea_wq_samples where organisation_id = '<ORG_ID>';
```

### D. Do-not list
- Do **not** run national-only work against the live instance DBs; the instances stay on their pinned release until retired.
- Do **not** load `app_config` or `profiles`/`auth.users` into national during the public-portal cutover.
- Do **not** stop an instance DB or its cron before national is confirmed serving that river (rollback relies on the instance staying current).
