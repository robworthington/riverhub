# River Hub — onboarding a new river onto the NATIONAL deployment

How to add a river to the single multi-tenant national database + deployment (`riverhub-national`,
Supabase `scmtmyoxylnjqzaoysek`). This is distinct from `PROVISIONING.md`, which stamps a *separate*
per-group instance (its own Supabase + Vercel + `app_config`/`public_org()`). Here every river is one
`organisations` row in **one** shared DB; the portal resolves the river from `/r/<slug>` (or a vanity
host) and scopes every RPC by `p_org`. **No code change, no new deploy** — a river is config + a data
load, loaded behind `live=false` and flipped live when verified.

**First worked example: River Yealm** (SWW, South Devon), onboarded 2026-11-22, org
`eb6a3c02-47ef-42e9-96e2-dbff9eeca176`. The "what we learned" notes below come from it.

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

Copy `yealm.json`/`teign.json` and derive the river-specific values.

**WFD water-body scope (the one judgement call).** Use the EA operational catchments, not a hand-list:
```bash
OPCAT=https://environment.data.gov.uk/arcgis/rest/services/EA/WFDSurfaceWaterOperationalCatchmentsCycle2/FeatureServer/0/query
# 1. find the river + estuary operational catchments by name (spatial or where opcat_name like '%<River>%')
curl -s -G "$OPCAT" --data-urlencode "where=opcat_name like '%<River>%'" \
  --data-urlencode "outFields=opcat_id,opcat_name" --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
# 2. the river opcat id -> its river water bodies (polygon-intersect the river WB layer against the opcat geom);
#    keep WBs whose NAME/≥40%-area is in the catchment, EXCLUDE neighbour WBs that merely clip the boundary.
# 3. record the ESTUARY (transitional) opcat id as wfd.estuary_opcat_id (drives estuary/foreshore outlet capture).
```
For the Yealm: river opcat **3555** → 5 WBs (Upper/Lower Yealm, Piall, Silverbridge Lake, Newton
Stream); estuary opcat **3556**. `geo.bbox`/`centre` were computed from the union of those two opcat
polygons (+~0.02° margin). `company.edm_feed` = the SWW `NEH_outlets_PROD` URL (same for every SWW river).

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
- **`spill_events`** globs the SWW start/stop workbooks from `EDM_STARTSTOP_DIR` (default `~/Downloads`) and
  filters them to the catchment — a clean no-op if none are present. REQUIRED for the board / dry-spills /
  reduction / live map pins (annual stats alone aren't enough).
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
The hourly cron (`/api/cron/edm-sync`) syncs **all** orgs (no `live` filter), so once the river's assets
exist its live snapshots populate at the next tick — or trigger it:
`curl -H "Authorization: Bearer $CRON_SECRET" https://riverhub-national.vercel.app/api/cron/edm-sync`.

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

---

## What we learned (Yealm) — streamline backlog for the next river

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
