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

### 3a. Core — the orchestrator
```bash
export DB_URL="<national pooler url>"
export CATCHMENT_CONFIG="config/catchments/<slug>.json"
export WWCA_DIR=~/wwca
export WINEP_XLSX="~/Downloads/PR24 WINEP National Dataset.xlsx"
/tmp/rh-venv/bin/python scripts/setup_catchment.py --config "$CATCHMENT_CONFIG" --db "$DB_URL"
```
Loads: parishes, water-bodies, **assets**, assign, systems, population†, **edm (annual stats)**, winep,
ea-wq, ea-wq-samples, gauges, rivers.

> ⚠️ **The orchestrator's verification counts are WHOLE-TABLE** (`select count(*) from sewage_assets`) —
> in a multi-org DB they show the cumulative total across every river. Ignore them; verify org-scoped
> (step 5). †**`population` is currently broken** — see step 4.

### 3b. The steps the orchestrator does NOT run (required for a complete river)
These populate tables `setup_catchment.py` never touches. **`spill_events` is the important one** — without
it the spills board, dry-spills, reduction tracker and live map pins are all empty.
```bash
V=/tmp/rh-venv/bin/python
# spill_events (granular history) — SWW per-year start/stop workbooks; importer filters to the catchment
$V scripts/import_edm_startstop.py --config "$CATCHMENT_CONFIG" \
   ~/Downloads/sww-2020-edm-start-stops---storm-overflows.xlsx \
   ~/Downloads/sww-2024-edm-start-stop---storm-overflows.xlsx \
   ~/Downloads/sww-2025-edm-start-stop---storm-overflows.xlsx \
   ~/Downloads/sww-2026-edm-start-stop---storm-overflows2.xlsx > /tmp/ss.sql
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt < /tmp/ss.sql
# protected areas (shellfish / bathing / SSSI / SAC-SPA-MCZ / drinking-water) — each emits SQL to stdout
for imp in import_shellfish_pas import_bathing_waters import_sssi import_nature_sites import_ogc_areas; do
  $V scripts/$imp.py --config "$CATCHMENT_CONFIG" > /tmp/$imp.sql
  docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt < /tmp/$imp.sql
done
```

**Rainfall/flow history (`ea-backfill`) — REQUIRED for dry-spills.** `setup_catchment.py` has `ea-backfill`
in `DEFAULT_SKIP`, so the `gauges` step registers rainfall *stations* but **no readings** are loaded. The
dry/wet classifier (`classify_spills`, live in the RPC) correlates each spill with rainfall; with no
readings **every spill is "unknown" → dry spills = 0**. Load the history:
```bash
# the backfiller reads gauge lists from /tmp — export them from the DB first (flow is empty if no gauges)
docker run --rm -i postgres:16 psql "$DB_URL" -qAt -c \
  "copy (select ea_station_id||'|'||ea_measure_rainfall from rainfall_stations
         where organisation_id='<org>' and ea_measure_rainfall is not null) to stdout" > /tmp/rain_gauges.txt
: > /tmp/flow_gauges.txt   # (or export river_gauges similarly if the catchment has flow gauges)
# ⚠️ --only alone won't run it (ea-backfill is in DEFAULT_SKIP); pass a dummy --skip to override:
EA_FROM=2021-01-01 $V scripts/setup_catchment.py --config "$CATCHMENT_CONFIG" --db "$DB_URL" \
  --only ea-backfill --skip none
```
No reclassify step is needed — dry/wet populate on the next page load once readings exist.

Optional, as needed: `emergency_overflows` (separate load — Dart-only so far), permits
(`import_permits.py`, manual PDFs → storage), WINEP PR19 (`import_winep.py --pr19-xlsx`).

### 3c. Live status — `edm_snapshots`
The hourly cron (`/api/cron/edm-sync`) syncs **all** orgs (no `live` filter), so once the river's assets
exist its live snapshots populate at the next tick — or trigger it:
`curl -H "Authorization: Bearer $CRON_SECRET" https://riverhub-national.vercel.app/api/cron/edm-sync`.

## 4. ⚠️ Population — known breakage (TODO)

`estimate_system_population.py` pulls OA centroids from the ONS `Output_Areas_2021_EW_BGC_V2`
FeatureServer — which **now returns `error 499 Token Required`** (made private upstream since Dart/Teign
loaded). The script swallows the error (`d.get("features", [])` → empty) and silently sets 0 OAs, so a new
river gets **no** population/capacity except where it shares parishes with an already-loaded river (those
inherit it — Yealm got 3 that way). The fix is to repoint the importer at a public OA-2021 source (the
boundaries service `…/Output_Areas_(December_2021)_Boundaries_EW_BFE_(V9)_and_RUC/MapServer` is public but
is polygons + a MapServer, so it needs the importer to request `returnCentroid` / handle geometry rather
than the old `LAT`/`LONG` fields). Until then, population is a documented gap, not per-river error.

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

1. **`setup_catchment.py` is incomplete for the national model.** It omits `spill_events` (the flagship
   board depends on it), `protected_areas`, `emergency_overflows`, and **`ea-backfill`** (rainfall/flow
   history — in `DEFAULT_SKIP`, so dry-spills read 0 until it's run with `--skip none`). → *Fold these
   into `setup_catchment.py` (or an orchestrated `--only extras` pass) so a river is complete in one run.*
2. **Verification counts are whole-table, useless in a multi-org DB.** → *Add an `--org` flag so each
   step's count filters by `organisation_id` (or drop the counts in favour of `verify-river.sh`).*
3. **Python TLS gotcha** — default 3.8 fails EA/ONS TLS; use the venv recipe in §0. → *Pin a project venv.*
4. **Population OA source is token-gated** (§4) — breaks population for every new river and re-runs. → *Fix
   the importer's OA endpoint.*
5. **`spill_events` history depends on manually-downloaded SWW start/stop workbooks** (no live service),
   and only 2020 + 2024–26 exist (2021–23 gap). → *Document the yearly-file dependency; fetch missing years.*
6. **Scope is driven by the asset join, not the bbox.** The start/stop importer's bbox pre-filter was loose
   (97 outlets) but the final join to the 19 real assets scoped it correctly — trust the org asset set.
7. **Parishes are shared** across rivers (`UNIQUE(name,district)`); a new river reuses existing parish rows
   (and inherits their population). No collision handling needed when loading fresh via the importer.
8. **Timings (Yealm, small catchment):** core orchestrator ~10 min; `spill_events` ~1 min; protected areas
   ~30 s; EA-WQ samples the slowest core step (~76 s, a few points rate-limited 429 — re-runnable).
