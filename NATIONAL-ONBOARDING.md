# River Hub — onboarding a new river onto the NATIONAL deployment

How to add a river to the single multi-tenant national database + deployment (`riverhub-national`,
Supabase `scmtmyoxylnjqzaoysek`). This is distinct from `PROVISIONING.md`, which stamps a *separate*
per-group instance (its own Supabase + Vercel + `app_config`/`public_org()`). Here every river is one
`organisations` row in **one** shared DB; the portal resolves the river from `/r/<slug>` (or a vanity
host) and scopes every RPC by `p_org`. **No code change, no new deploy** — a river is config + a data
load, loaded behind `live=false` and flipped live when verified. All of this held so far because every
river is **South West Water**; onboarding a river from a **different water company** (Wessex, Thames, …) is
the same config + load path plus a **one-time ~10-line generalisation** of the live-feed adapter — see §8.

**Worked examples:** River Yealm + River Erme (hand-configured, 2026-11-22), then the full **South West
Water area** via the generator + batch runner (§7) — 25 river catchments onboarded in one overnight pass
(2026-11-23) and flipped live after verification, giving **29 live rivers** on the national deploy (the 25
+ Dart, Teign, Erme, Yealm). The "what we learned" notes below, and learnings 9–11 especially, come from
that batch.

---

## 0. Prerequisites

- **National DB connection** — session-pooler URI (`…pooler.supabase.com:5432`), kept out of the repo.
- **A Python venv with working SSL + the import packages.** ⚠️ *Gotcha:* the machine's default
  `python3` (3.8) fails TLS to the EA/ONS services (`CERTIFICATE_VERIFY_FAILED` — the corporate-proxy
  root isn't in its bundle), while `/usr/bin/python3` has working TLS but lacks `openpyxl`/`pyshp`.
  Build one env that has both:
  ```bash
  /usr/bin/python3 -m venv /tmp/rh-venv
  /tmp/rh-venv/bin/python -m pip install openpyxl pyshp
  ```
  Run every importer with `/tmp/rh-venv/bin/python`.
- **Docker** (for the `postgres:16` psql client — no local psql needed).
- **`WWCA_DIR`** — the unzipped `wastewater-catchment-areas` release (`~/wwca`), for the `systems` step.
- **SWW EDM start/stop workbooks** — `~/Downloads/sww-YYYY-edm-start-stop*.xlsx` (currently 2020, 2024,
  2025, 2026). Needed for `spill_events` (step 3a). Company-wide files; the importer filters to the catchment.
- **`WINEP_XLSX`** — the EA PR24 WINEP National Dataset xlsx (for the `winep` step).

---

## 1. Catchment config — `config/catchments/<slug>.json`

**Generate it — don't hand-derive.** `scripts/gen_catchment_config.py <opcat_id> <slug> <org-uuid>`
derives the whole config from an EA WFD **operational-catchment id**:
```bash
/usr/bin/python3 scripts/gen_catchment_config.py 3555 yealm $(uuidgen) \
  --river "River Yealm" --county Devon          # writes config/catchments/yealm.json
```
What it does, and why:
- **Water bodies come from the Catchment Data Explorer, not the FeatureServer.** The generator scrapes
  the opcat's CDE page (`…/catchment-planning/OperationalCatchment/<id>`) for its member river water
  bodies — that is the **authoritative** membership. ⚠️ *Learned the hard way:* the WFD FeatureServer
  spatial test (`contains`/`intersects`) both **over**- and **under**-includes neighbours (opcat and
  WB-catchment polygons are generalised differently) — e.g. it returned 13 WBs incl. Avon ones for the
  Erme, and a blank `" "` id. The hand-built `erme.json`/`dart.json` (pre-generator) were conversely
  *under*-scoped (Erme missed Ayleston Brook; Dart missed 4 WBs). Prefer the generator.
- Lake/TraC ids on the CDE page are dropped automatically (kept only if they resolve as *river* WBs).
- **Estuaries are single-owner.** It attaches a dedicated-estuary TraC opcat (name ends "Estuary", or a
  ria in `RIA_NAMES`) only when that estuary belongs to *this* river. ⚠️ *Learned:* big shared estuaries
  (Tamar Estuary 3434, Exe Estuary 3182, Taw/Torridge 3442) intersect **several** river opcats; attaching
  one to all of them mis-attributes the same estuarine outlets to every river. The batch run therefore
  reassigns each estuary to one owner (name-token match to the main stem; sole-intersector otherwise;
  dropped if genuinely shared). For a single river, eyeball the generated `estuary_opcat_ids` and remove
  any estuary that is really a neighbour's. A river with no dedicated estuary gets `estuary_opcat_ids: []`.
- `geo.bbox/centre/radius_km` come from the opcat extent; `company` defaults to the SWW preset
  (`NEH_outlets_PROD` feed) — pass `--company` when more presets exist.

**Finding the opcat id / enumerating a whole water-company area:** list the operational catchments in a
river basin district and spatially test each against the company's outlet feed — a catchment with ≥1 of
the company's outlets is theirs (this cleanly excludes neighbouring companies: in the South West RBD the
8 Wessex-served opcats show 0 SWW outlets). `scripts/onboard_company.py plan` does this (§7).

### 1b. A catchment served by two water companies

Some catchments (mainly on the Welsh border, and a few Thames / Southern / Wessex edges) hold overflows
from two companies. Generate the config with the majority company as `--company` and the other as
`--extra-company` (repeatable); it gains `"extra_companies": [...]`. `setup_catchment.py` then runs the
company-specific steps (`assets`, `systems`, `edm`, `spill_events`, `winep`) once per company, and each of
those importers limits its deletes to the company it is loading, so the second pass keeps the first's
rows. Each overflow records its own company's live feed (`sewage_assets.edm_feed_url`, migration 0112);
the hourly sync groups overflows by feed, and the live-data credit names every company
(`public_river_companies`). Set the org row's `company_name` / `edm_feed_url` to the majority company.

## 2. Seed the org row — `live=false`

`live=false` makes the river invisible to `national_summary()`, `national_rivers()` and `public_river()`
(all filter `where o.live`), so you load and verify with zero public exposure.
```sql
insert into organisations
  (id, name, slug, river_slug, region, live, river_name, portal_name, company_name, logo_url,
   map_centre_lat, map_centre_lng, map_zoom, capacity_response, edm_feed_url, edm_feed_kind)
values ('<org-uuid>', '<Group Name>', '<group-slug>', '<slug>', 'South West', false,
   '<River X>', '<River X Data>', 'South West Water', '/fod-mark.png',
   <lat>, <lng>, 12, false,
   'https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query',
   'arcgis_edm');
notify pgrst, 'reload schema';
```
`id` must equal the config's `org_id`. Do **not** touch `app_config` (national uses `p_org`).

## 3. Load the data

### 3a. One command — `setup_catchment.py` loads a complete river
```bash
export DB_URL="<national pooler url>"
export CATCHMENT_CONFIG="config/catchments/<slug>.json"
export WWCA_DIR=~/wwca                                       # systems step
export WINEP_XLSX="~/Downloads/PR24 WINEP National Dataset.xlsx"   # winep step
export EDM_STARTSTOP_DIR=~/Downloads                         # spill_events: dir of sww-*-edm-start-stop*.xlsx
export EA_FROM=2021-01-01                                    # ea-backfill: how far back to pull rainfall/flow
/tmp/rh-venv/bin/python scripts/setup_catchment.py --config "$CATCHMENT_CONFIG" --db "$DB_URL"
```
Runs, in order: parishes → water-bodies → **assets** → assign → systems → population† → **edm** (annual
stats) → **spill_events** → winep → ea-wq → ea-wq-samples → **pa-shellfish/bathing/sssi/nature/ogc** →
gauges → rivers → **ea-backfill**. The former new-river gaps are now folded in:
- **`spill_events`** reads start/stop files from `EDM_STARTSTOP_DIR` (default `~/Downloads`) and filters them
  to the catchment — a clean no-op if none are present. REQUIRED for the board / dry-spills / reduction / live
  map pins (annual stats alone aren't enough). **Company-general** (see §8): SWW uses its `sww-*` workbooks;
  every other company uses the EA England-wide "Detailed EDM Start/Stop" yearly ZIPs dropped in the same dir.
- **`pa-*`** load protected areas (shellfish, bathing, SSSI, SAC/SPA/Ramsar/MCZ, drinking-water).
- **`ea-backfill`** loads rainfall/flow history (it self-reads the catchment's gauge list from the DB, so no
  manual `/tmp` export). REQUIRED for dry-spill detection — the classifier correlates each spill with
  rainfall; with no readings every spill is "unknown" and **dry spills read 0**. Set `EA_FROM` for depth.
  (No longer in `DEFAULT_SKIP`; `--skip ea-backfill` to opt out.)

> The new steps' per-step verify counts are **org-scoped** (`{org}` = the config `org_id`). The older
> steps' counts are still whole-table (cumulative across rivers) — use `verify-river.sh` (step 5) for the
> authoritative per-river reconciliation. †`population` — fixed, see step 4.

### 3b. Not orchestrated
- **`emergency_overflows`** — no importer yet (Dart's were loaded ad hoc).
- **`edm_snapshots`** (live status) — from the hourly cron, see §3c (not a load step).
- Optional, as needed: permits (`import_permits.py`, manual PDFs → storage), WINEP PR19
  (`import_winep.py --pr19-xlsx`).

### 3c. Live status — `edm_snapshots`
The hourly cron (`/api/cron/edm-sync`, Vercel `vercel.json` `0 * * * *`) syncs **all** orgs (no `live`
filter), so once the river's assets exist its live snapshots populate at the next tick — or trigger it:
```bash
# whole fleet:
curl -H "Authorization: Bearer $CRON_SECRET" https://riverhub-national.vercel.app/api/cron/edm-sync
# one river on demand (targeted re-sync / a freshly onboarded river):
curl -H "Authorization: Bearer $CRON_SECRET" "https://riverhub-national.vercel.app/api/cron/edm-sync?slug=<river_slug>"
```
⚠️ *Two things learned the hard way running this for SWW (both now fixed — see learnings 9–10):*
- **The sync runs orgs through a bounded concurrency pool** (`CONCURRENCY=5`), not sequentially. With ~29
  orgs the old one-by-one loop got through only ~16 before Vercel's 60s cap killed it, so the tail rivers
  went stale and the last org (fowey) never synced at all (0 snapshots). The pool does the full fleet in
  ~17 s. The **`?slug=`** param (added in the same fix) is the handle for syncing one river without waiting
  out — or timing out — the whole fleet; it 404s on an unknown slug.
- **`CRON_SECRET` lives only in the national Vercel project env** (Settings → Environment Variables), not in
  the repo. The repo's `.env.local` holds the *dev/Dart-Teign* secret, which **401s** against the national
  deploy. To trigger manually, copy the value from the national Vercel env (or rotate it there — then
  redeploy so the new value reaches the running function; the hourly cron auto-sends whatever is current).
- Confirm it worked per river (not just HTTP 200): `select count(*) from edm_snapshots where
  organisation_id='<org>' and snapshot_date = current_date;` should be > 0 (one row per monitored asset).

## 4. Population — OA endpoint (fixed)

`estimate_system_population.py` used the ONS `Output_Areas_2021_EW_BGC_V2` FeatureServer for OA centroids,
which ONS made token-gated (`error 499 Token Required`) — the script swallowed the error and silently
loaded 0 OAs. **Fixed:** repointed to the public **`OA_2021_EW_BFE_V9_RUC` FeatureServer (layer 3)**, which
carries the same `OA21CD`/`LAT`/`LONG` fields, and added a fail-loud guard (exit on an OA-service error or
0 rows) so this can't silently degrade again. Nothing to do per river — the orchestrator's `population`
step now works. (If ONS gates this layer too, find another public OA-2021 service with `LAT`/`LONG`, or one
that supports `returnCentroid`.)

## 5. Verify — org-scoped (NOT the orchestrator counts)

```bash
scripts/verify-river.sh <slug> <org-uuid> [base-url] [db-url]   # reconciliation + portal smoke
```
- **Load/isolation (DB):** per-table counts `where organisation_id=<org>` are all non-zero where expected;
  **the other rivers' counts are unchanged** from before the load (clean isolation); `national_summary()`
  still shows the old river count while `live=false`.
- **Accuracy (external cross-checks):**
  - *Scope* — the loaded assets are all genuinely in-catchment (names/locations), **no neighbour bleed**;
    the loaded `water_bodies` == the EA opcat's river WBs.
  - *History* — spot-check a named outlet's `edm_annual_stats` (spill count + hours) vs the EA Annual
    Return; confirm `spill_events` year coverage matches the start/stop files you loaded.
  - *Live* — after a cron tick, compare an outlet's `edm_snapshots` status vs SWW WaterFit Live.
- **Render (needs `live=true`):** `/r/<slug>/explore/{spills,…,ea-monitoring}` 200 + river-branded +
  river-scoped; `national_summary()` river count +1; chooser lists the river.

## 6. Go live / teardown

- **Expose:** `update organisations set live=true where river_slug='<slug>';` then redeploy so the ISR `/`
  national summary rebuilds to include it (`/r/<slug>` pages are dynamic and appear immediately).
- **Teardown (test river):** delete the org's rows from the per-org tables (FK order) then the org row;
  leave shared `parishes`/`river_segments`/`wastewater_catchments` reference rows.
- **River basin district (automatic):** a new river is placed in its EA river basin district (the one most
  of its located overflows sit in) by the next hourly `refresh_national_rollup()`, so it appears on its
  `/d/<district>` page and in the breadcrumb with no manual step. To place it straight away:
  `select assign_river_districts();` (`(true)` re-places every river). The district outlines are loaded
  once per database by `scripts/import_river_basin_districts.py` (migration 0094); run it with
  `/usr/bin/python3` (see the TLS note above) and re-run only if the EA catchments change.

## 7. Scale — onboarding a whole water-company area in one pass

Proven for the full SWW area (25 rivers in one run); since Phase 0.4 of `ENGLAND-ROLLOUT-PLAN.md` the
steps are committed scripts (run with `/usr/bin/python3`, see the TLS note):
1. **Plan** — `scripts/onboard_company.py plan --company <preset> --rbd "<district>" [--rbd …]
   [--check-company <other preset>] --min-outlets 3 --out batches/<company>.csv`. Places every outlet in
   the company's live feed into the districts' river operational catchments (TraC excluded) and writes a
   **review sheet**: one row per catchment with outlet counts, other companies present (two-company
   catchments, §1b), a proposed river name and slug, and notes ("check name", "already onboarded",
   "majority company is …", slug clashes). Takes ~15 s for two districts.
2. **Review** — tidy names/slugs (EA names like "Bristol Avon Urban" or "Brue and Axe" need a person),
   set `approve=yes` on the rows to onboard. Rob approves the names (ENGLAND-ROLLOUT-PLAN.md §6).
3. **Configs** — `onboard_company.py configs --sheet batches/<company>.csv --company <preset>` generates a
   config per approved row (fresh org uuid, written back to the sheet), then gives each **estuary to one
   river only** (committed configs keep theirs; otherwise the new river with most outlets), noting it in
   the sheet. Commit the configs and the sheet.
4. **Seed** — `onboard_company.py seed --sheet … --company <preset> > /tmp/seed.sql`, review, apply: org
   rows `live=false`, `region` = company short name (e.g. `Wessex`), `steward='river_hub'`.
5. **Batch-load** — `scripts/run_batch.py --sheet batches/<company>.csv --db "$DB_URL" --jobs 4` runs
   `setup_catchment.py` for every approved river in parallel (logs in `logs/<slug>.log`), continues past
   failures, then runs the org-scoped `verify-river.sh` for each and writes `batches/<company>.results.csv`.
   ~15–35 min/river (`ea-wq-samples` and OSM `rivers` dominate). `--dry-run` shows the plan only.
6. **Re-run sweep → verify → go live.** After the batch (`run_batch.py --rerun batches/<company>.results.csv --db "$DB_URL"` re-runs only each river's failed steps):
   - **Sweep the transient failures** with a targeted `setup_catchment.py --config <cfg> --only <step[,step]>`
     per affected river (`run_batch.py --rerun`). The failures cluster into two kinds (learning 9):
     upstream EA FeatureServer **HTTP 500s** on the overlay steps (`pa-sssi`/`pa-ogc`/`pa-shellfish`/`gauges`)
     and momentary **DB connection drops** (`SSL error: unexpected eof`) on apply steps (`edm`/`winep`/
     `ea-backfill`). Both clear on a re-run; a persistent EA 500 for one bbox (we saw `pa-sssi` for two
     rivers) just needs re-running later when their server recovers — it's one secondary overlay, not a
     go-live blocker.
   - **Verify** every river org-scoped (counts non-zero, assets coded to parish+WB, isolation intact — the
     already-live rivers' counts must be unchanged).
   - **Flip live as one reviewed batch:** `update organisations set live=true where region='South West' and
     live=false [and slug <> '<any-held-back>']; notify pgrst,'reload schema';` then confirm
     `select count(*) from national_rivers();`. Hold back (and report) any river whose verification is off —
     e.g. an anomalously low `spill_events` count (learning 10).
   - **Trigger live status** once live (§3c) and confirm every river has `snapshot_date = current_date` rows.
   DB growth is ~a few hundred MB/river (mostly `ea_wq_samples`); check the plan's disk.
> Load concurrency: rivers are org-scoped so they *could* run in parallel, but the EA/ONS/OSM endpoints
> rate-limit (OSM Overpass especially) — sequential is more reliable for the load. (The *live-status cron*
> is a different story — there the per-org work is light and bounded-parallel is the right call; §3c.)

---

## 8. A river from a different water company — the NSOH route

Recon 2026-11-23 (Phase 0 for the Wessex POC). The whole "add a river = config + load" promise extends to
**every English water company** with one small, one-time code change — because the national open-data
sources we depend on are already England-wide, and the per-company piece is a single component.

**What's already England-wide (no change for a new company):**
- **Catchment / WFD water bodies** — EA Catchment Data Explorer + `gen_catchment_config.py` (§1).
- **Sewage asset register** — EA, any company.
- **Spill *history* (annual counted spills + hours)** — the EA EDM **Annual Return**; `validate_edm.py
  --company "<Company>"` already reconciles any company against it ([[riverhub_national_phase1]]).

**The one company-specific thing: the live "spilling now" feed — and it's nearly free.** The **National
Storm Overflow Hub ("Stream", `streamwaterdata.co.uk`, Water UK)** is **not one API** — it's a
**federation of per-company public ArcGIS FeatureServers**, each named `<Company>_Storm_Overflow_Activity`,
layer 0, **anonymous / no key**, `maxRecordCount` 2000, **CC BY 4.0**. SWW's node is our existing
`NEH_outlets_PROD` feed — **so our `arcgis_edm` adapter is already an NSOH adapter.** The feeds share one
standard schema (`Id, Company, Status [1 spilling/0 not/-1 offline], StatusStart, LatestEventStart,
LatestEventEnd, Latitude, Longitude, ReceivingWaterCourse, LastUpdated`; dates epoch-ms; per-company id
scheme, e.g. `SBB#####` SWW, `WXW#####` Wessex) and **differ only in field-name casing** — SWW publishes
camelCase (`status`), the NSOH standard (Wessex et al.) publishes PascalCase (`Status`). `src/lib/edm/sync.ts`
hardcodes SWW's camelCase, so unchanged it reads **all-null** snapshots for any other company.

Per-company feed endpoints (append `/0/query`): **Wessex**
`services.arcgis.com/3SZ6e0uCvPROr4mS/.../Wessex_Water_Storm_Overflow_Activity` · SWW `…/NEH_outlets_PROD` ·
plus Thames, Severn Trent, Anglian, United Utilities, Yorkshire, Northumbrian, Southern, Scottish, and an
ST-Connect aggregate — all in the same `*_Storm_Overflow_Activity` pattern (full list in memory
`riverhub_nsoh_feeds`).

**One-time setup to support all other companies (do once):**
1. **Generalise `arcgis_edm` field-casing — in BOTH feed parsers.** The per-company feed casing is read in
   two independent places, and both must be lowercased or a non-SWW river silently loads empty:
   - **`src/lib/edm/sync.ts`** (the runtime live-status cron) — request `outFields=*` and lowercase-normalise
     each feature's attribute keys before mapping to `OutletAttrs` (and make the interface + reads
     canonical-lowercase). Done in commit `b6911a0`.
   - **`scripts/import_catchment.py` `fetch_outlets()`** (the LOAD-time asset importer) — it has its *own*
     copy of the feed parse (`a.get("longitude")`/`"latitude"`), hardcoded to SWW camelCase. ⚠️ *Missed in the
     first recon and caught at verify on the Wessex Tone POC (2026-11-23):* with it unfixed, `fetch_outlets`
     read 0 outlets for Wessex (PascalCase `Longitude`/`Latitude`), so `_incat` was empty and the river loaded
     **0 assets** — and because `edm`/`systems`/`gauges`/`ea-backfill` all key off the loaded assets, every one
     of them cascaded to 0 too, while the orchestrator's **whole-table** verify counts still said "ok"
     (learning 2 — trust only the org-scoped verify, step 5). Fix identically: `outFields=*` + lowercase the
     attribute keys. Regression-check SWW still parses.

   Regression-check SWW still parses in both (its lowercased keys are unchanged). After both, `edm_feed_kind=
   'arcgis_edm'` works for every company.
2. **Add the company preset** to `scripts/gen_catchment_config.py`'s `COMPANIES` dict, e.g.:
   ```python
   "wessex": {
       "name": "Wessex Water",
       "edm_feed": "https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/Wessex_Water_Storm_Overflow_Activity/FeatureServer/0/query",
       "annual_sheet_match": "Wessex Water",
   },
   ```

**Then per river, exactly as §1–§6, with three differences:**
- **Config:** `gen_catchment_config.py <opcat_id> <slug> $(uuidgen) --company wessex` (enumerate the
  company's opcats as §7.1, testing against *its* outlet feed).
- **Org row (§2):** set `edm_feed_url` to the company's FeatureServer `/0/query` and `company_name`
  accordingly; `edm_feed_kind` stays `'arcgis_edm'`.
- **Attribution (go-live, §6):** the live feed is **CC BY 4.0**, so show a per-company credit — e.g.
  "Live data © Wessex Water, CC BY 4.0" — alongside the existing WaterFit/live credit. (Annual history stays
  EA Annual Return / OGL.)

**Discrete `spill_events` history — now generalised to every company (`import_edm_startstop.py`).** The
step reads TWO interchangeable sources, auto-detected by column layout, both keyed by the company's own
outlet id (`Unique ID` == `sewage_assets.asset_unique_id`), so no crosswalk:
- **SWW per-year workbooks** (`sww-*-edm-start-stop*.xlsx`, sheet "Data", separate Date+Time columns) — SWW's
  richer set (2020 + 2024–26), kept as SWW's source.
- **EA England-wide "Detailed EDM Start/Stop Data"** (data.gov.uk, **OGL**) — one file per company per year,
  covering all 10 English WaSCs (2024, 2025, 2026-to-Sept). Columns `Unique ID`, `Site Name`, `Discharge
  Start (GMT)`, `Discharge End|Stop (GMT)` (ISO-8601). Download the yearly ZIPs (`<Year> … Start-Stop
  Data.zip`) into `EDM_STARTSTOP_DIR`; the importer pulls the catchment company's member straight from each
  ZIP (reader is tolerant of the EA's year-to-year drift: CSV or XLSX, single- or multi-sheet, `End` vs
  `Stop`, "Detailed EDM Data" vs "Detailed Data" member names, `Dwr Cymru`/`Welsh`).

So a **non-SWW river now gets full discrete history** (board / dry-spills / reduction), not just annual
stats + live status — proven on Wessex River Tone (69,417 events across 2024–26 from the EA ZIPs). Only
caveat: the EA detailed dataset starts at **2024** (no 2021–23), so pre-2024 depth needs the company's own
archive if it publishes one. `feed_ids()` in the importer got the same field-casing generalisation as §8.1
(it reads the live feed to bbox-prefilter) — it too was SWW-camelCase and returned 0 outlets for Wessex.

---

## What we learned — streamline backlog for the next river

0. **Config scope: use the CDE, not the FeatureServer; estuaries are single-owner (DONE — generator).**
   The authoritative water-body membership of an operational catchment is the Catchment Data Explorer
   opcat page, not a WFD-FeatureServer spatial test (which over/under-includes neighbours). Big estuaries
   (Tamar/Exe/Taw-Torridge) are shared by several river opcats and must be assigned to exactly one owner or
   the same outlets get mis-attributed to every neighbour. Both are handled by `gen_catchment_config.py` +
   the batch reassignment (§1, §7). The pre-generator hand configs (`dart.json`, `erme.json`) are slightly
   *under*-scoped (Erme missing Ayleston Brook GB108046005020; Dart missing 4 WBs) — regenerate when
   convenient (Dart is the live `release-v1` flagship, so re-scope it deliberately, not casually).
1. **`setup_catchment.py` was incomplete for the national model — now folded in (DONE).** It used to omit
   `spill_events`, `protected_areas` and `ea-backfill` (the last silently in `DEFAULT_SKIP`), so an
   orchestrated run left the spills board, dry-spills and protected areas empty. These are now orchestrated
   steps; a plain `setup_catchment.py` run produces a complete river. Still out: `emergency_overflows` (no
   importer) and `edm_snapshots` (runtime cron) — see §3b.
2. **New steps' verify counts are org-scoped** (`{org}` interpolation); the legacy steps' counts remain
   whole-table. → *Org-scope the rest, or rely on `verify-river.sh` for the per-river truth.*
3. **Python TLS gotcha** — default 3.8 fails EA/ONS TLS; use the venv recipe in §0. → *Pin a project venv.*
4. **Population OA source was token-gated** (§4) — fixed by repointing to the public BFE V9 FeatureServer.
5. **`spill_events` history depends on manually-downloaded SWW start/stop workbooks** (no live service), and
   only 2020 + 2024–26 exist (2021–23 gap). The step globs `EDM_STARTSTOP_DIR` and is a no-op if absent. →
   *Keep the yearly workbooks in `~/Downloads`; fetch missing years for full dry-spill depth.*
6. **Scope is driven by the asset join, not the bbox.** The start/stop importer's bbox pre-filter was loose
   (97 outlets) but the final join to the 19 real assets scoped it correctly — trust the org asset set.
7. **Parishes are shared** across rivers (`UNIQUE(name,district)`); a new river reuses existing parish rows
   (and inherits their population). No collision handling needed when loading fresh via the importer.
8. **Timings (Yealm, small catchment):** core orchestrator ~10 min; `spill_events` ~1 min; protected areas
   ~30 s; EA-WQ samples the slowest core step (~76 s, a few points rate-limited 429 — re-runnable).
9. **Transient failures are normal in a long batch — design for them (SWW, 24-river run).** ~11 of 24 rivers
   hit a failed step, *all* transient, *none* a bad config: (a) upstream **EA FeatureServer HTTP 500s** on the
   overlay steps (`pa-sssi`/`pa-ogc`/`pa-shellfish`/`gauges`) — bursty, often several in one bad window; (b)
   momentary **DB connection drops** (`SSL error: unexpected eof while reading`) on apply steps
   (`edm`/`winep`/`ea-backfill`). → *Loop continue-on-failure, then a `--only <steps>` re-run sweep clears
   them (`run_batch.py --rerun`). One EA endpoint stayed 500 for two bboxes — re-run later; a single
   missing protected-area overlay never blocks go-live.* This is why the step verify counts matter per river.
10. **`spill_events` can silently come back empty from a transient feed blip — catch it at verify, don't
    publish it.** One river (par) loaded **0** `spill_events` while its step reported OK, because
    `import_edm_startstop.py`'s `feed_ids()` (live SWW feed filtered to the bbox) returned 0 outlets in that
    one fetch — a network hiccup, not a data gap (the same query returned 40 outlets on re-run, → 2,679
    events). → *At verify, flag any river whose `spill_events` is anomalously low vs its asset count / peers,
    hold it back from `live=true`, and re-run `--only spill_events`. Don't trust a 0 that "succeeded".*
11. **The `edm-sync` cron didn't scale past ~16 orgs — fixed with a concurrency pool + `?slug=` (DONE,
    commit `cde6f23`).** It synced orgs **sequentially**; at ~29 orgs a run got through ~16 before Vercel's
    60s `maxDuration` killed it, leaving tail rivers stale and the last org (fowey) permanently at 0
    snapshots. Fix: sync through a rolling `CONCURRENCY=5` pool (full fleet in ~17 s) and add an optional
    **`?slug=<river_slug>`** for on-demand single-river syncs (the handle that fixes a never-reached or
    freshly onboarded river instantly). → *Revisit the pool size / `maxDuration` only if org count grows well
    past ~50. The `CRON_SECRET` to trigger it is in the national Vercel env, not the repo (§3c).*
12. **A second water company is a ~10-line change, not a new adapter (recon DONE, build pending — §8).** The
    NSOH live feeds are per-company public ArcGIS FeatureServers (CC BY 4.0) on the **same schema as SWW's,
    differing only in field-name casing**; our `arcgis_edm` adapter already reads SWW's node. → *One-time:
    lowercase-normalise attribute keys in `sync.ts` + add the company preset to `gen_catchment_config.py`;
    then every company is config-only. The remaining SWW-specific path is discrete `spill_events` history
    (SWW start/stop workbooks) — generalise that importer as the scaling follow-up. Full feed list + licence
    in memory `riverhub_nsoh_feeds`.*
13. **The per-company feed casing is parsed in TWO places, not one (Wessex Tone POC, 2026-11-23).** The
    `b6911a0` recon fixed only the TS runtime `sync.ts`; the load-time `import_catchment.py` `fetch_outlets()`
    has its own SWW-camelCase parse and was missed, so Tone loaded **0 assets** (and `edm`/`systems`/`gauges`/
    `ea-backfill` cascaded to 0) while the whole-table verify counts read "ok". Caught only by the org-scoped
    verify (step 5). → *Both parsers now lowercase-normalise keys (§8.1). For any third company, grep the
    importers for a feed parse before trusting a load, and never trust a legacy step's whole-table "ok".*
