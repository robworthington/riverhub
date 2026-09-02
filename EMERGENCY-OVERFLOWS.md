# Emergency overflows (EOs / PSEOs)

A separate class of sewage outfall from the storm overflows the rest of River Hub tracks, surfaced on
`/explore/spills/emergency-overflows` (a tab under "What's happening now").

## What they are
A pumping station lifts sewage over high ground toward a treatment works. An **emergency overflow**
(EO — most here are **PSEOs**, pumping-station emergency overflows) is a relief outlet that discharges
raw sewage straight to the river if that pump fails (power cut, mechanical fault, blockage), to stop
sewage backing up into homes. It is permitted, but only for genuine emergencies. An EO discharging for
hundreds of hours a year is a chronic fault, not an emergency.

## Why there is no live feed
EOs carry the same EDM monitoring hardware as storm overflows, but their data is in a **different
regulatory category**:
- **not** in the water company's near-real-time storm-overflow feed (`NEH_outlets_PROD`, the ArcGIS
  feed the hourly `edm-sync` cron polls), and
- **not** in the EA's EDM Annual Return storm-overflow dataset.

So there is nothing to sync. The only way to get the numbers is to ask for them under the
**Environmental Information Regulations (EIR)**. The Dart data is from **EIR26209** (South West Water):
18 EOs, annual spill count + duration 2020–2025. This is a *snapshot*, refreshed only when a new
disclosure is made — it is not, and cannot be made, live.

> This is exactly why a specific EO can be missing from every routine dataset: e.g. Blackrock SPS PSEO
> (permit 201570) is absent from both the live feed and the 2024 annual return, yet the EIR shows it
> discharging for 375 hours in 2023.

## How it's stored
`supabase/migrations/0070_emergency_overflows.sql`:
- `emergency_overflows` — one row per EO (name, permit, OSGB + WGS84 coords, EDM commissioning year,
  `sewage_system_id`). Each is assigned to its terminal **works** by the same spatial method as storm
  overflows (0035): the wastewater-catchment polygon it falls in → that catchment's `sewage_system`,
  with a nearest-within-3 km fallback. This is what powers the cross-link on a storm overflow's page.
- `eo_annual_spills` — one row per EO per year: `spill_count`, `duration_hours`, plus a **`monitored`**
  flag (false before the EDM commissioning year — so a pre-monitoring 0 renders as "—", not "no spills")
  and a **`partial_year`** flag (the current, incomplete year, excluded from "last full year" figures).
- Public RPCs (anon-readable via `public_org()`): `public_emergency_overflows()` (list + jsonb year
  history), `public_eo_for_system(uuid)` (the works cross-link), `public_eo_summary()` (board callout).

The Dart seed is **guarded to the Friends of the Dart org** and no-ops on other instances; the schema
and RPCs apply everywhere (Teign gets empty tables and the page's empty state until it has its own EIR).

## Reading the figures (caveats baked into the page)
- **Duration (hours) is the honest metric.** The **count** uses the EA **12/24-hour block method** (first
  12 h of a discharge = one spill; each further 24 h = one more), so one long spill shows a low count —
  e.g. Warfleet No.2's 2023 = 106 "spills" but **2,514 hours** (~105 days).
- **A dash = no monitor that year.** Most EOs were EDM-fitted around 2022; earlier zeros are absence of
  data, not clean performance. Totals/latest/worst count only monitored years.
- **2025 is year-to-date.**
- Figures are **as supplied by the company** in the EIR response.

## Refreshing with a new EIR
Re-run the seed section of `0070` (or a new migration) with the updated `values` blocks. The inserts are
idempotent (`on conflict … do update`), so re-applying with new years/rows updates in place; then re-run
the spatial `sewage_system_id` assignment and `notify pgrst, 'reload schema'`. The page is dynamically
rendered, so it reflects the new data on the next request — no redeploy needed.
