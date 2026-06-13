# Historical EDM data — sourcing research & recommendation

*Research, 13 June 2026. How River Hub should pull historical storm-overflow (Event Duration
Monitoring) data from the Environment Agency source. Proposal — not yet implemented.*

## The problem with the current approach

`scripts/import_annual_stats.py` (+ the permit/type enrichment in `import_catchment.py`) gets
historical EDM from the **per-year annual-return spreadsheets**:

- Hardcodes a `fileDataSetId` and **guesses the zip filename** (`EDM_<year>_Storm_Overflow_Annual_Return.zip`), unzips, and opens the "all water and sewerage companies" `.xlsx`.
- The workbook layout **drifts between years** — columns are found by fuzzy header matching; `2020` is unjoinable and dropped.
- Joins to our assets by **Unique ID (2024) or fuzzy operational site name (2021–23)** — brittle.
- Spill durations arrive as `hh:mm:ss`/`"4 days, 12:34:56"` strings needing bespoke parsing.
- Needs a **manually-downloaded** workbook on disk (`EDM_ANNUAL_XLSX`) for asset permit/type — the single biggest provisioning snag in the Teign pilot.

## What the EA actually publishes

Three distinct things (verified against the live endpoints, 13 Jun 2026):

| Source | What | Use for |
|---|---|---|
| **EA EDM Annual Returns — all-years FeatureServer** (ArcGIS, EA-owned `Peter.Boden_environment`) | Geocoded, per-outlet, **all years in one queryable layer** (2021–2025), audited regulatory data | **Primary historical source (recommended)** |
| **data.gov.uk dataset** `19f6064d-…` (per-year `.xlsx`-in-`.zip` + long-term-trends) | The same regulatory data as files (2020–2025) | Documented **fallback** / archival |
| **Stream / National Storm Overflow Hub** API | *Near-real-time* spill activity, water-company sourced, **different methodology, not audited** | Live spills only — *not* historical/regulatory (we already get live via the SWW feed) |

The Rivers Trust "Sewage Map" feature services are mirrors of the near-real-time hub data — same caveat, not the regulatory return.

## Recommendation

**Primary: query the EA all-years EDM FeatureServer by catchment, like we already do for WFD water bodies and the live outlet feed.**

```
https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/edm_annual_returns_all_years_public/FeatureServer/0
```

One paginated bbox query (`geometryType=esriGeometryEnvelope`, the catchment bbox, `outSR=4326`,
`resultRecordCount=1000` + `resultOffset` paging) returns every outlet × year in the catchment,
**already geocoded**. It is the layer behind the EA's public "Storm Overflow Spill Frequency"
portal. Verified: 1,064 rows intersect the Teign bbox across all years; years present 2021–2025.

Why it's strictly better than the spreadsheets:

| Current pain | FeatureServer fixes it |
|---|---|
| Guess zip id + filename per year | One stable service, all years; filter `annual_return_year` / `water_company_name` in the query |
| Parse drifting `.xlsx` layouts | Stable typed fields |
| Manual `EDM_ANNUAL_XLSX` download | Nothing to download — HTTP query, like our other importers |
| `hh:mm:ss` duration parsing | `total_spill_duration_hrs_calculated` (numeric, pre-computed) |
| Fuzzy site-name join | `permit_reference_ea_condat` + `unique_id` + `old_unique_id_pre_2024` join keys, **or just use the point geometry** |
| Separate WFD spatial join for water body | `wfd_waterbody_id` + `wfd_waterbody_name` come in the row |
| Separate district assignment | `localauthority_area_name_calculated` in the row |

Field map (FeatureServer → our schema):

| Our column | FeatureServer field |
|---|---|
| `sewage_assets.latitude/longitude` | point geometry (`outSR=4326`) |
| `asset_unique_id` | `unique_id` (fallback `old_unique_id_pre_2024`) |
| `asset_name` | `site_name_wasc_op_name` or `site_name_ea_condat` |
| `asset_type` | `storm_discharge_asset_type` (same vocab as today's `TYPE_MAP`) |
| permit | `permit_reference_ea_condat` |
| `edm_annual_stats.year` | `annual_return_year` |
| `edm_annual_stats.spill_count` | `counted_spills_12_24hr_calculated` |
| `edm_annual_stats.total_duration_hours` | `total_spill_duration_hrs_calculated` |
| `edm_annual_stats.reporting_pct` | `edm_operation_percent_calculated` |
| water body | `wfd_waterbody_id` / `wfd_waterbody_name` |

**This collapses three brittle steps into one.** A single `import_edm.py` (config-driven, bbox from
`catchment.geo.bbox`, filtered to `company.name`) could feed **both** `edm_annual_stats` *and* the
asset rows (geocoded, permit, type, water body) — potentially replacing `import_annual_stats.py`,
the manual-xlsx dependency in `import_catchment.py`, and even the water-body assignment, since the
water body arrives in the row. Filter out planning placeholders with `has_data = 1`.

**Fallback (keep documented): the data.gov.uk catalogue API.** Even if we stay on the spreadsheets,
stop hardcoding the file id — resolve per-year URLs from the dataset's CKAN API so new years appear
automatically and filenames aren't guessed:
```
https://www.data.gov.uk/api/3/action/package_show?id=19f6064d-7356-466f-844e-d20ea10ae9fd
→ result.resources[] : name "EDM_<year>_Storm_Overflow_Annual_Return.zip", url (direct download)
```

## Caveats (verify at implementation)

- **Hosting permanence.** The FeatureServer is an EA-staff ArcGIS Online item (public, behind the
  official portal) — operationally the EA's, but an AGOL item *could* be renamed/retired. The
  data.gov.uk zips are the more formally-permanent artifact. Hence: FeatureServer primary, catalogue
  API as a coded fallback. Pin the service URL in config so it's a one-line change if it moves.
- **2020** is in the data.gov.uk zips but **not** in this FeatureServer (2021–2025). We already treat
  2020 as unjoinable, so no loss; note it.
- **Counting method.** Use the `…_12_24hr_calculated` fields — the EA's standardised 12–24h count,
  consistent across years (raw pre-processing columns also exist; don't use those).
- **Estuary water bodies** use a different id scheme (`GB5108…` transitional vs `GB108046…` river),
  so joining EDM `wfd_waterbody_id` to our `water_bodies` covers river outlets; estuary/foreshore
  outlets still resolve fine by point geometry.
- **Numeric fields are null for not-yet-installed outlets** (`has_data=0`, e.g. some 2021 rows say
  "EDM to be installed by December 2023") — filter them out.

## Status — IMPLEMENTED (14 Jun 2026)

`scripts/import_edm.py` is live and is the orchestrator's `edm` step (replacing `annual-stats` /
`import_annual_stats.py`, now superseded). Config-driven; filters by **water company only** (not
bbox — assets are clipped to the catchment polygon, which can extend past the rectangular bbox,
e.g. Princetown on the West Dart); matches EDM outlets to our assets by unique id then a 150 m
spatial nearest fallback; replaces only the years the feed provides (preserving e.g. a
separately-backfilled 2020); `EDM_FS_URL`-overridable if the EA relocates the layer.

Verified on the local Dart: all 45 assets matched (vs 44 before — Princetown/Strete now included),
2020 preserved, **2025 added**, spill counts in line with the old figures (2024: 3,105 vs 3,037 —
the small shift is the EA's standardised 12–24h count). **No manual `EDM_ANNUAL_XLSX` needed for
annual stats.**

**Assets too (done 14 Jun 2026):** `import_catchment.py` now takes its asset type/permit/site
enrichment from the same FeatureServer (keyed by Unique ID == the live feed's `Id`, latest year
per outlet) instead of the manual workbook. The live SWW outlet feed remains the authoritative
*outlet set* (the daily cron depends on its `Id`); only the enrichment source changed. So
**`EDM_ANNUAL_XLSX` is gone entirely** — the whole `setup_catchment` pipeline now fetches from live
open-data services with nothing to download. Verified on the local Dart: 45 assets, all typed, no
spreadsheet. The data.gov.uk catalogue-API fallback is documented above but not coded (the
FeatureServer has been reliable).

---

Sources:
- [EDM Storm Overflows — Annual Returns (data.gov.uk dataset)](https://www.data.gov.uk/dataset/19f6064d-7356-466f-844e-d20ea10ae9fd/event-duration-monitoring-storm-overflows-annual-returns)
- [EA all-years EDM Annual Returns FeatureServer](https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/edm_annual_returns_all_years_public/FeatureServer/0)
- [What are the 2024 Storm Overflow EDM Annual Returns? (EA blog)](https://environmentagency.blog.gov.uk/2025/03/27/what-are-the-2024-edm-annual-returns/)
- [National Storm Overflow Hub / Stream — near-real-time API](https://www.streamwaterdata.co.uk/pages/the-national-storm-overflow-hub)
