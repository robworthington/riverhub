# Determining which sewage assets feed a river catchment — repeatable method

A reliable, repeatable procedure for (a) finding every monitored sewage outlet that drains to a
given river catchment, and (b) grouping them into sewage treatment systems. Designed to be
re-run for any English river. Validated on the **River Dart** (see §6).

## Why the obvious shortcuts fail
- **Name matching** on the live feed's `receivingWaterCourse` misses tributaries (Dart misses
  Webburn, Ashburn, Bidwell Brook…) and is ambiguous (multiple "Dart"s exist in Devon).
- **EA Operational Catchment** polygons are too coarse — the Dart's is *"Dart, Start Bay and
  Torbay"*, bundling unrelated coastal water bodies.
- **Hydrometric area** (`GB108046…`) lumps the Teign, Avon, Erme, Bovey and Dart together.

→ The reliable membership test is **spatial point-in-polygon against a precise catchment
boundary**, where the boundary is the **union of the WFD river water-bodies that actually drain to
the river**.

## Data sources
| Purpose | Source |
|---------|--------|
| Live spill status + outlet location | Water-company EDM feed. SWW = ArcGIS `NEH_outlets_PROD` FeatureServer (`Id`, `lat/long`, `receivingWaterCourse`, `status`). (Other companies have equivalents; EA also publishes a national EDM map service.) |
| Catchment boundary | EA `WFDRiverWaterBodyCatchmentsCycle2` FeatureServer (`environment.data.gov.uk/arcgis/rest/services/EA/...`), fields `wb_id`, `wb_name`. Polygons via `f=geojson`. |
| Catchment hierarchy (to pick water bodies) | EA Catchment Data Explorer (`environment.data.gov.uk/catchment-planning`). |
| Asset **type** + **treatment-works grouping** + permit | EA *EDM Storm-Overflow Annual Returns* (per overflow: **Site Name** = works, **Discharge Site Type** = CSO/STW/PS, permit ref, NGR). |
| Works/pumping stations not in EDM | EA *Consented Discharges to Controlled Waters* (permits). |

## Method

### Step 1 — Define the catchment boundary (once per river, reviewable)
1. In the Catchment Data Explorer, locate the river's operational catchment and list its WFD
   **river water-bodies**.
2. **Select the water-bodies that drain to the target river** (review on a map; exclude adjacent
   coastal/other-river bodies). Record their `wb_id`s — this list is the per-river config.
3. **Add the estuary.** River water-bodies stop at the tidal limit; the estuary is a separate WFD
   **transitional (TraC)** unit. Include the estuary's catchment polygon (its EA Operational
   Catchment, e.g. Dart = *"Dart Estuary"* opcat 3122) so estuarine outlets aren't missed.
4. `ST_Union` all of the above into one geometry (PostGIS), and apply a **~150 m shoreline buffer**
   (compute in British National Grid / EPSG:27700) so outlets that discharge on the shore or into
   the channel — which sit just outside the land polygon — are captured.

> *Both refinements were discovered during the Dart validation (§6): without the estuary + buffer,
> 19 genuine estuary outlets were missed.*

> Gold-standard alternative: DEM watershed delineation from the river mouth (removes the manual
> selection); heavier tooling, not needed here.

### Step 2 — Membership (spatial)
Fetch all company EDM outlets; keep those where `ST_Contains(catchment, outlet_point)`.

### Step 3 — Cross-check
List the `receivingWaterCourse` of the contained outlets; every value should be a river-system
name. Any outlier ⇒ a wrong water-body was included (or an outlet is mis-located) — review.

### Step 4 — Enrich (type, works, permit) — **exact ID join**
The **EA EDM Storm-Overflow Annual Return** (one sheet per water company) keys every outlet by
**`Unique ID`**, which is the **same code as the live feed** (`SBBxxxxx` for SWW). So enrichment is
an **exact join on Unique ID** — no fuzzy spatial join needed. From it attach:
- **`Storm Discharge Asset Type`** → our `asset_type`:
  - `SO on sewer network` → `combined_sewer_overflow`
  - `Storm discharge at pumping station[...]` → `pumping_station`
  - `Inlet SO at WwTW` → `sewage_treatment_works`
  - `Storm tank at WwTW[...]` → `storm_tank`
- **`Site Name (WaSC operational)`** (e.g. `31 FORE STREET_CSO_TOTNES`) → works/grouping (see Step 5)
- **`EA Permit Reference`** / `Activity Reference` → permit
- **`Outlet Discharge NGR`** → independent location (for outlets missing from the live feed)
- `WFD Waterbody ID/Catchment (Cycle 3)`, receiving water, bathing/shellfish flags, spill
  count/duration, EDM operational % — all available.

Supplement non-EDM works / pumping stations from the **consented-discharges permits** where needed.

### Step 5 — Group into systems
The annual return tells us which outlets are **at a WwTW** (`Inlet SO at WwTW`, `Storm tank at
WwTW`) — these anchor the treatment-works sites in the catchment. CSOs / pumping-station overflows
are grouped to their works using the **town/site token** in the `Site Name (WaSC operational)`
(SWW names as `<location>_<assetcode>_<TOWN>`, e.g. `…_TOTNES`).
**Caveat:** true sewer connectivity (which pumping station pipes to which works) is **not in open
data** — this grouping is a heuristic; the resulting system map is **stored as a reviewed table**
and curated manually where the naming is ambiguous.

## v2 refinements (folded in; see §6 for what the Dart validation showed)
1. **Estuary via TraC polygon, not just a buffer.** Prefer the transitional/coastal water-body
   geometry; keep a small (~150 m) shoreline buffer as a *backstop* and report buffer-only catches.
2. **Two independent membership signals.** Primary = spatial point-in-polygon (geometry —
   **cycle-robust**). Cross-check = the outlet's WFD Waterbody ID ∈ the river's *specific* water-body
   ID set. **Do NOT** filter by WFD-ID *prefix* (`GB108046…` is the whole hydrometric area —
   Teign/Bovey/Avon too). Note the Annual Return is **Cycle 3**; polygons here are Cycle 2 — match on
   geometry or map IDs across cycles, never assume identical IDs.
3. **Exact enrichment join** on `Unique ID` (Step 4) replaces the earlier nearest-point join.
4. **Boundary-band review.** List outlets 0–500 m *outside* the boundary as review candidates
   (catches mis-located grid refs) rather than silently dropping them.
5. **Objective selection (future).** Replace manual water-body picking with river-network "drains-to"
   traversal from the outlet body, or DEM watershed delineation from the river mouth.
6. **Provenance + diff.** Stamp each asset with source + boundary version + run date; importer is
   idempotent and reports added/removed/moved outlets on re-run.

### Step 6 — Persist & poll
Upsert into `sewage_assets` (+ `sewage_systems`); the existing daily sync (M2) polls live status
per outlet.

## Per-river config to save
```jsonc
{
  "river": "Dart",
  "company_feed": "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/.../NEH_outlets_PROD/FeatureServer/0",
  "wb_ids": [ /* the selected WFD water-body IDs — see §6 for the Dart */ ],
  "river_mouth": [50.34, -3.58]  // Dart estuary mouth (for optional DEM delineation / labelling)
}
```

## 6. River Dart — selected water bodies
WFD river water-bodies that drain to the Dart / its estuary (hydrometric area 46):

| wb_id | name | | wb_id | name |
|-------|------|-|-------|------|
| GB108046008350 | Dart | | GB108046008390 | East Webburn River |
| GB108046005060 | Dart (Tidal) | | GB108046008410 | West Webburn River |
| GB108046008420 | East Dart River | | GB108046005250 | Webburn |
| GB108046008400 | West Dart River (Upper) | | GB108046005220 | Mardle |
| GB108046008340 | West Dart River (Lower) | | GB108046005190 | Dean Burn |
| GB108046008361 | West Dart River (Blackbrook to Swincombe) | | GB108046005270 | Ashburn |
| GB108046005240 | Swincombe | | GB108046005160 | Bidwell Brook |
| GB108046008370 | Blackbrook River | | GB108046005230 | Hems - Upper |
| GB108046008380 | Cherry Brook | | GB108046005430 | Hems - Lower |
| | | | GB108046005170 | Harbourne River |
| | | | GB108046005080 | Wash |

Plus the estuary: **Operational Catchment 3122 "Dart Estuary"** (transitional water).

*Excluded as non-Dart (drain to Start Bay / Teign / Avon): The Gara, Torr Bk, Teign system, Bovey
system, Lemon, Avon system, Erme, etc.*

## 7. Validation results (point-in-polygon, run on the live SWW feed)
Ran `ST_Contains(boundary, outlet)` over **all 1,345 South West Water outlets**:

| Boundary definition | Dart outlets | Notes |
|---------------------|-------------:|-------|
| River water-bodies only (20) | 25 | estuary outlets missing |
| + Dart Estuary catchment (3122) | 36 | estuary picked up |
| + 150 m shoreline buffer | **44** | shoreline/in-channel estuary outlets captured |

**Quality checks:**
- **0 false positives** — no Teign / Avon / Erme / **Little Dart** outlets were included at any
  stage. This is the key win: name-matching on "DART" would have wrongly pulled in the North-Devon
  *Little Dart* (Taw system) outlets (SBB00238/00256/00257/00397/00516/01010); the spatial method
  correctly excludes them.
- Contained outlets' receiving waters are all genuine Dart-system: River Dart, Dart Estuary,
  Bidwell Brook, Blackbrook, East Webburn, Ashburn, Mardle, Dean Burn, Harbourne, Holy Brook,
  Harberton/Broadhempston/Gatcombe streams.

**Conclusion:** the precise water-body union + estuary + shoreline buffer gives **~44 Dart-catchment
EDM outlets** to poll, with no cross-catchment contamination. Method validated and repeatable.

*(Next: enrich these 44 with type/works/permit from the EA EDM Annual Return, then load into
`sewage_assets` and group by works into `sewage_systems`.)*
