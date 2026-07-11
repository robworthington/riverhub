# Bulk result import — tool design

A tool for River Hub users to upload a file of test results for one or more sites, validate it, and
import it idempotently — designed so the same pipeline later powers an import **API**.

## Motivating example
`Shaldon Bathing Water_date_time_split.xlsx` — one sheet per site, a title row, a header row, then one
row per **sampling visit** carrying multiple measurements + context:

`Date | Time | Tide/Height (M) | Tide (Max M) | Tide (Ebb/Flood) | Weather | Rain 48hrs (mm) | Rain (15min max/mm) | E.Coli (cfu/100ml) | IE (cfu/100ml)`

Two structural facts:
1. **Wide → long.** The file is wide (many measurements per row); `test_results` is long (one per row).
   Each visit row **unpivots into N result rows** (Shaldon → 2: E. coli + IE).
2. **Hidden qualifiers.** `10` usually means "<10" (detection limit); `10000` may mean ">10000". Parse
   a leading `<`/`>` into `result_qualifier`.

## Formats
| Format | Role | Notes |
|---|---|---|
| **XLSX** | primary human upload | what users already produce; typed dates; one sheet per site |
| **CSV** | lightweight upload / export round-trip | one site, or a `Site` column |
| **JSON** | canonical internal shape + future API | not for hand-editing |

All parse into one **canonical record**, so validation + loading are shared and the API is just a
fourth front-end onto the same pipeline.

## Canonical record (internal shape and API contract)
```json
{
  "site": "Shaldon Bathing Water",
  "sampled_at": "2025-04-30T13:16:00",
  "context": { "weather": "Sun", "rainfall_48h_mm": 0, "condition": "dry",
               "tide_height_m": 2, "tide_state": "E" },
  "measurements": [
    { "test": "E. coli (culture)", "value": 10, "qualifier": "<", "unit": "cfu/100ml" },
    { "test": "Intestinal enterococci (culture)", "value": 10 }
  ]
}
```

## Template users follow
Ship a downloadable template (XLSX + CSV) with a fixed, documented column set:
- **One row per visit.** Required: Site (or sheet name) + Date + ≥1 measurement.
- **Recognised context columns:** Time, Weather, Condition, Rainfall 48h, Rain 15min, Temperature,
  Salinity, Tide height, Tide state…
- **Measurement columns** named to match test types (`E. coli (cfu/100ml)`, `IE (cfu/100ml)`,
  `Bactiquick score`…); numeric values, optional `<`/`>` prefix.
- **Multi-site:** one sheet per site (XLSX) or a `Site` column (CSV).
- **Unrecognised columns** are preserved into a per-result `context` (jsonb) — nothing is lost.

## Architecture — built for the API from day one
```
   CSV parser ─┐
   XLSX parser ─┼─► Mapper (import profile) ─► Validator ─► Loader (idempotent upsert)
   API JSON ────┘        │                        │              │
                   canonical records         errors/warnings   imports + test_results
```
The upload wizard and the future `POST /api/import/results` share **Mapper + Validator + Loader**;
only the front-end differs. Building the wizard is ~80% of the API.

## Data model
- **`imports`** — batch audit: id, org, filename, format, uploaded_by, target site, status, row
  counts, created_at. Each imported `test_result` stamps `source='upload'`,
  `source_ref='<import_id>:<row-hash>'`.
- **Idempotency** — upsert on a deterministic natural key `hash(site_id, sampled_at, test_type_id)`
  via `source_ref`, so re-uploading reconciles instead of duplicating. The single most important
  correctness feature.
- **`test_results.context` (jsonb)** — home for recognised-but-unmodelled fields (tide, 15-min rain),
  so new columns don't need a migration each time. First-class columns stay for things we chart.

## UX — a wizard
1. **Upload** CSV/XLSX (raw file kept in the evidence bucket for audit).
2. **Map** — auto-apply the matching import profile, or map columns→fields + sheet/column→site; save
   as a reusable profile.
3. **Preview & validate (dry run)** — per-row errors/warnings (unknown site, bad date, non-numeric,
   out-of-range, unmatched column); nothing written.
4. **Confirm & import** — write, then report inserted/updated/skipped/errored + an error CSV.
5. **Import history** — one row per batch; basis for "undo this import".

## Concerns
- **Security:** editor role + RLS; size/row caps; read XLSX data-only (ignore formulas → CSV-injection
  safe); reject macros.
- **Resolution:** match existing sites/test types (don't auto-create); surface unmatched in preview.
- **Detection limits:** parse `<`/`>` → `result_qualifier`.
- **Locale:** ISO dates in the template; handle Excel serial dates.

## Phasing
1. **MVP (this phase):** XLSX/CSV upload → bathing-water template → validate → **idempotent import for a
   user-selected site**, with the `imports` audit table, `context` jsonb, and import history. Ingests
   the Shaldon file end-to-end.
2. Custom column mapping + saved profiles; multi-site (sheets / `Site` column).
3. ✅ **`POST /api/import/results`** (canonical JSON) with API keys — reusing the shared loader. See
   [IMPORT-API.md](IMPORT-API.md). Keys managed at Admin → API keys (`0047_api_keys`).
