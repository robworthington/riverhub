# Priority & protected water sites — designations, measures & data sources

A repeatable method for identifying the **designated and priority sites** that drive water-company
infrastructure upgrades or trigger additional Environment Agency monitoring, the **measures** each
designation attracts, and the **open datasets** to ingest them into River Hub and link them to
existing catchments, water bodies and sewage assets. England-focused (EA jurisdiction; covers the
Dart and Teign instances). *(Evidence base: deep-research report, 2026-06-25 — 21 primary sources,
25 claims adversarially verified, 24 confirmed / 1 refuted.)*

> The single most valuable linkage for River Hub is **SODRP "high priority site" → EDM overflow
> asset**: it lets every monitored outlet carry its statutory reduction deadline (2035/2045/2050).

## 1. The three legal families

England's priority / extra-monitoring sites sort into three families, plus bathing waters which sit
under their own regime:

1. **WFD Protected Areas** — the EA's statutory register under the **Water Environment (WFD)
   (England & Wales) Regs 2017 (SI 2017/407) reg.10**, maintained per River Basin District:
   Drinking Water Protected Areas, **Shellfish Water Protected Areas** (reg.9), recreational
   (bathing) waters, and nutrient-sensitive areas.
2. **Habitats & wildlife sites** — SACs, SPAs, Ramsar, SSSIs, MCZs, governed by the **Conservation
   of Habitats and Species Regs 2017 (SI 2017/1012) reg.63** (Habitats Regulations Assessment: a
   plan/project must have "no adverse effect on the integrity" of the site, on Natural England's
   advice). This is the legal engine behind **nutrient neutrality**.
3. **SODRP "high priority sites"** — a *policy* bucket (Storm Overflows Discharge Reduction Plan,
   expanded Sept 2023) that reuses the above designations: SSSIs, SACs, SPAs, Ramsar, MCZs,
   Shellfish Water PAs, UWWTR sensitive areas, chalk streams and failing waters — **~5,600 overflows
   nationally**.

**Designated Bathing Waters** sit apart, under the **Bathing Water Regulations 2013 (SI 2013/1675)
reg.3**.

## 2. Site types & legal basis

| Site type | Legal basis | Relevance to water companies / EA |
|---|---|---|
| **Bathing Waters** | Bathing Water Regs 2013 (SI 2013/1675) reg.3, Sch.2 Pt1 | Statutory classification (Excellent→Poor); in-season EA bacterial monitoring; drives storm-overflow priority |
| **Shellfish Water PAs** | WFD Regs 2017 (SI 2017/407) reg.9; Shellfish Waters (England) 2016; register reviewed 22 Dec 2021, then 6-yearly | Microbial/chemical standards; SODRP high-priority; WINEP investigations |
| **SAC / SPA / Ramsar** | Conservation of Habitats & Species Regs 2017 (SI 2017/1012) reg.63 (HRA) | "No adverse effect on integrity" → nutrient-neutrality & phosphorus-stripping obligations |
| **SSSI** | Wildlife & Countryside Act 1981 (boundaries via Natural England) | Underpins many SAC/Ramsar designations; SODRP high-priority |
| **Drinking Water PAs / Safeguard Zones** | WFD Regs 2017 (SI 2017/407) reg.10 | Catchment measures protecting abstractions; EA monitoring |
| **Nitrate Vulnerable Zones** | Nitrate Pollution Prevention Regs 2015 | Farm nutrient controls; nutrient context for catchments |
| **SODRP high-priority sites** | Storm Overflows Discharge Reduction Plan (policy, expanded Sept 2023 — *not* statute) | The 2035/2045/2050 overflow-reduction deadlines attach to these |

**Confidence note:** the claim that designated bathing waters are *"legally entitled"* to specific
treatment passed verification only 2-1 (all other site-basis claims 3-0). Treat the bathing-water
*obligation* as policy/SODRP-driven rather than a hard statutory entitlement.

## 3. Measures each designation triggers

| Driver | Measure | Deadlines / detail |
|---|---|---|
| **SODRP** (policy) | Storm-overflow reduction | **2035**: all overflows near *every* designated bathing water + **75%** of high-priority nature sites; **2045**: remaining high-priority; **2050**: all overflows, capped ~**10 spills/yr regardless of location**. "Near" = 5 km inland / 1 km coastal |
| **Bathing Waters** | Spill-frequency standards + classification | ≤3 discharges/season = "good", ≤2 = "excellent"; in-season EA bacterial monitoring |
| **WINEP (PR24)** | Improvement / investigation / monitoring actions | Action types: prevent-deterioration, improve, investigation, monitoring; significance S / S+ / NS; derived from RBMPs. AMP8 = ~24,000 actions, £22.1bn across 19 companies |
| **Environment Act 2021 s.82** → WIA1991 **s.141DB** | **Continuous upstream/downstream monitoring** of storm overflows + sewage works discharging to watercourses (dissolved O₂, temperature, pH, turbidity, ammonia) | Monitoring accreditation from **April 2026** |
| **Habitats sites (SAC/SPA/Ramsar)** | Nutrient neutrality / phosphorus stripping | HRA-driven; applies to plans/projects in affected catchments |

**Refuted claim (do not encode):** the narrow framing that nutrient neutrality "applies *only* to
new housing in already-unfavourable catchments and *only* prevents (never reduces) pollution" was
**rejected (1-2 votes)**. Nutrient neutrality is broader in both scope and intent than that.

## 4. Datasets to ingest

All Open Government Licence v3.0 unless noted. **CRS warning:** most ship in **EPSG:27700 (British
National Grid)**; River Hub uses WGS84 / EPSG:4326 geography — reproject on import (`ST_Transform`)
or spatial joins silently return nothing.

| Dataset | Endpoint | Format / access | Key fields |
|---|---|---|---|
| **Bathing waters** (locations, IDs, classifications) | `https://environment.data.gov.uk/bwq` ; locations: `data.gov.uk/dataset/dcb8bd46-c4cf-4749-bad0-7663da96845c/bathing-waters-monitoring-locations` | JSON API + CSV | bathing-water ID, name, point coords, latest class |
| **Shellfish Water PAs** | `data.gov.uk/dataset/a276c27a-1245-488f-b724-74f86f3ae766/...shellfish-water-protected-areas-in-england` | Polygon (Shapefile/GeoJSON) | SWPA ID, name, WFD water-body ref |
| **SAC / SPA / Ramsar / SSSI / MCZ + priority habitats** | Natural England Open Data Geoportal `naturalengland-defra.opendata.arcgis.com` ; viewer `magic.defra.gov.uk` | CSV/KML/GeoJSON/GeoTIFF + ESRI REST / WMS / WFS | site code, name, designation type, geometry |
| **Nutrient Neutrality Catchments (England)** | `data.gov.uk/dataset/09864c9e-c589-47f3-9566-89d86a31036c/nutrient-neutrality-catchments-england` ; live ESRI FeatureServer (`services.arcgis.com/JJzESW51TqeY9uat/.../Nutrient_Neutrality_Catchments_England/FeatureServer`) + OGC API-Features / WFS / WMS (`environment.data.gov.uk/spatialdata/nutrient-neutrality-catchments/`) | Shapefile / GeoPackage / GeoJSON / File-GDB + live API | catchment name, designated site, nutrient |
| **Nitrate Vulnerable Zones (2021)** | `data.gov.uk/dataset/77ffd32c-13db-4d83-a1f8-044c5397bc34/nitrate-vulnerable-zones-nvz-2021-designations` | Polygon | NVZ ID, type |
| **WFD Protected Areas register** (per RBD) | EA Catchment Data Explorer `environment.data.gov.uk/catchment-planning/.../RiverBasinDistrict/6/protected-areas` | Web + API, by water body | **WFD water-body ID**, protected-area category |
| **PR24 WINEP National Dataset** | `environment.data.gov.uk/dataset/39b11ea0-3cfa-4cbb-b3a1-b5950019f169` | **XLSX + ArcGIS app only — no WFS/REST** | action ref, company, driver, type, significance, dates |

## 5. Linking into River Hub

River Hub is already part-way there:

- **WINEP (PR24)** — already ingested (`winep_actions`). No new work.
- **WFD water-body IDs** — already stored per catchment (`config/catchments/*.json` `wfd.wb_ids`).
  This is the **cleanest join key**: the EA Catchment Data Explorer protected-areas register keys on
  WFD water-body ID, so Shellfish / Bathing / Drinking-Water designations can be attached to water
  bodies **without geometry maths**.
- **`bathing_water` / `shellfish_water` flags** — already on `test_sites` / `sewage_assets`
  (populated as EDM hints). The datasets above let these be set **authoritatively**.

**The genuinely new work** is the protected-area **boundary layers** (Shellfish PAs, SAC/SPA/Ramsar/
SSSI, NN catchments, NVZ) as polygon overlays, plus the SODRP priority crosswalk.

### Proposed schema
A single `protected_areas` table (PostGIS), one row per designated feature:

```
protected_areas(
  id, organisation_id,
  designation text,        -- 'bathing_water' | 'shellfish_pa' | 'sac' | 'spa' | 'ramsar' |
                           --   'sssi' | 'mcz' | 'drinking_water_pa' | 'nvz' | 'nn_catchment'
  source_id text,          -- the dataset's native ID (bathing-water ID, SWPA ID, NE site code…)
  name text,
  wfd_wb_id text,          -- WFD water-body ref where the dataset provides one (clean join)
  sodrp_high_priority boolean,
  geom geometry,           -- reprojected to 4326
  attrs jsonb,             -- designation-specific fields (latest class, nutrient, deadline…)
  source text, created_at
)
```

Linkage strategies, in order of preference:
1. **By WFD water-body ID** — direct join to the catchment's `wfd.wb_ids` (no geometry). Works for
   the Catchment Data Explorer register layers.
2. **By geometry** — `ST_Intersects` the designation polygon against the catchment boundary /
   water-body geometry; `ST_DWithin` for "near" tests (5 km inland / 1 km coastal for bathing).
   Required for the Natural England boundary layers, which do **not** expose a WFD ID.

### Recommended ingestion order
1. **Shellfish Water PAs + Bathing waters** — small, high-impact, directly set the existing flags;
   the Teign estuary is itself a shellfish water, so this exercises the schema end-to-end.
2. **SAC / SPA / Ramsar / SSSI** overlay — nature-site context for nutrient/HRA obligations.
3. **SODRP high-priority → EDM asset crosswalk** — badge each monitored outlet with its statutory
   reduction deadline. Highest analytical value; hardest to source (see open questions).

### Implementation status
- ✅ **Layer 1 — Shellfish Water PAs** (`import_shellfish_pas.py`; EA GeoJSON, PostGIS clips to bbox).
- ✅ **Layer 2 — Bathing waters** (`import_bathing_waters.py`; EA bwq API, points + latest classification in `attrs`).
- ✅ **Layer 3 — SAC / SPA / Ramsar / MCZ** (`import_nature_sites.py`; NE ArcGIS FeatureServers, `outSR=4326&f=geojson` bbox query, multipart parts `ST_Collect`-ed into one row per site).
- ⏭️ **SSSI** — the NE `Sites_of_Special_Scientific_Interest_England` FeatureServer is **token-gated**; source from the data.gov.uk bulk GeoJSON (like shellfish) as a follow-up.
- ⏭️ **NVZ, Drinking Water PAs, Nutrient-Neutrality catchments**, and the **SODRP → EDM asset crosswalk**.
- Surfaces: portal map "Protected sites" overlay (`public_protected_areas`) + district/parish "Protected & designated sites" section (`protected_areas_for_parishes`).

## 6. Open questions / caveats

- **Join keys vary by layer.** The Catchment Data Explorer register exposes a WFD water-body ID
  (clean join); the Natural England boundary layers do not (geometry join only). Expect a mix.
- **Drinking Water PAs / Safeguard Zones, standalone SSSIs, NVZ** open endpoints on the EA/Defra
  Data Services Platform need confirming (EA dataset `2803f216-…` looked like a Drinking-Water PA
  candidate but was not fully verified).
- **SODRP → EDM crosswalk.** No verified public mapping from the ~5,600 high-priority overflows to
  EDM overflow asset IDs was found; this likely needs deriving (spatial proximity of an overflow to
  a high-priority designation) rather than a published lookup.
- **Bathing-water list changes yearly** — re-pull from `environment.data.gov.uk/bwq`, don't snapshot.
- **PR24 WINEP has no WFS/REST API** — use the XLSX (already handled by `import_winep.py`).
- **SODRP targets are policy, not statute** — present deadlines as policy commitments.
- **CRS** — reproject EPSG:27700 → 4326 on import.

## 7. Sources (primary)

- Water Environment (WFD) (E&W) Regs 2017, SI 2017/407 — `legislation.gov.uk/uksi/2017/407/part/3/made`
- Conservation of Habitats and Species Regs 2017, SI 2017/1012 — `legislation.gov.uk/uksi/2017/1012`
- Bathing Water Regulations 2013, SI 2013/1675; list of designated waters — `gov.uk/government/publications/bathing-waters-list-of-designated-waters-in-england`
- Expanded Storm Overflows Discharge Reduction Plan (Sept 2023) — `assets.publishing.service.gov.uk/media/6537e1c55e47a50014989910/Expanded_Storm_Overflows_Discharge_Reduction_Plan.pdf`
- WINEP PR24 methodology — `gov.uk/government/publications/developing-the-environmental-resilience-and-flood-risk-actions-for-the-price-review-2024/water-industry-national-environment-programme-winep-methodology`
- Environment Act 2021 s.82 — `legislation.gov.uk/ukpga/2021/30/section/82`
- EA Catchment Data Explorer protected areas — `environment.data.gov.uk/catchment-planning/.../protected-areas`
- PR24 WINEP National Dataset — `environment.data.gov.uk/dataset/39b11ea0-3cfa-4cbb-b3a1-b5950019f169`
- Natural England maps & data guidance — `gov.uk/guidance/how-to-access-natural-englands-maps-and-data`
- Nutrient Neutrality Catchments (England) — `data.gov.uk/dataset/09864c9e-c589-47f3-9566-89d86a31036c`
- POSTnote on nutrient neutrality — `post.parliament.uk/research-briefings/post-pn-0755/`
- Commons Library CBP-9617 (storm overflows) — `commonslibrary.parliament.uk/research-briefings/cbp-9617/`
