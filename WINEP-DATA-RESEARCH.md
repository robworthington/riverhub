# WINEP data — research & integration plan

*Research, 14 June 2026. What the EA/water companies publish about the Water Industry National
Environment Programme (WINEP), how it links to River Hub assets, how delivery is monitored, and
how it slots into the national-dataset stack for per-catchment rollout. Verified against live
endpoints. Proposal — not yet implemented.*

## What WINEP is
WINEP is the EA-issued, legally-binding set of **actions each water company must complete in a
price-review cycle** to meet environmental obligations. Two cycles matter:
- **PR24 / AMP8 (2025–2030)** — issued Jan 2025; **~24,000 actions, £22.1 bn**. SWW: **782 actions**
  (incl. ~562 storm-overflow improvements), all marked "Proceed".
- **PR19 / AMP7 (2020–2025)** — the previous cycle's required actions (the delivery baseline).

## 1. What the EA publishes, and the regulatory requirement per action

**Datasets (national, all 19 companies, all England):**
| Dataset | Form | IDs |
|---|---|---|
| PR24 WINEP | national `.xlsx` + **geocoded ArcGIS layer** | data.gov.uk `cf9b80c2-…`; file ds `63ec410d-…` |
| PR19 WINEP | dataset | environment.data.gov.uk `7e8173ec-…` |
| WINEP **Driver Codes** lookup | ArcGIS (EA-owned) | `services1.arcgis.com/JZM7qJpmv7vJ0Hzx/.../DriverCodes` |

The **regulatory requirement is encoded in the driver code** on each action (decode via the Driver
Codes service). SWW's PR24 drivers seen live include:
- **`U_IMP1/2/4/7`** — Urban Waste Water (storm-overflow / WwTW) improvements; **`U_MON3/4`** monitoring
- **`EnvAct_IMP*`** — Environment Act 2021 storm-overflow reduction duties
- **`BW_ND / BW_NDINV`** — Bathing Water (no-deterioration / investigation)
- **`SW_ND / SW_INV`** — Shellfish Water; **`HD_IMP/INV`** Habitats Directive; **`WFD_*`** Water
  Framework Directive (status, flow, chemicals, phys-habitat); **`INNS_*`** invasive species;
  **`DrWPA_INV`** drinking-water protected areas.

Each action row also carries: `actionName`, `actionDescription`, `completionDate` (the **legal
deadline**), `optionsAssessmentOutcome`, receptor links (`primaryBathingWater`, `…ShellfishWater`,
`SSSI`, `SAC/SPA/Ramsar`, `MCZ`), and **permit changes** — `currentPermitDWF → proposedPermitDWF`,
plus BOD/NH3/Phosphorus/chemical current→proposed. *That permit block is exactly the data the
data-gap checklist flagged as missing.*

## 2. Linking WINEP actions to specific assets — feasible

The geocoded layer carries the join keys we need:
- **`actionName`** uses the **same `NAME_TYPE_TOWN` convention as our `sewage_assets`** (e.g.
  `SALCOMBE REGIS_STW_SALCOMBE REGIS`) — direct name match to assets.
- **`wbID`** = WFD water body → joins our `water_bodies` (we hold `ea_water_body_id`).
- **Point geometry** (lat/lng) → spatial nearest-asset.
- `licenseObstructionID` / permit fields → permit linkage.

**Linkage strategy** (mirrors the EDM importer): match by asset name first, then `wbID`, then
spatial proximity. **Caveat on precision:** the EA's *authoritative* WINEP locations are published
as **1 km grid polygons** (deliberately coarse); the cleaned point layer used here derives a point
(`geomSource`). So link confidently to the **works / water body**, and treat exact-outlet matches as
indicative. For storm-overflow actions that's fine — they attach to a works or overflow we already
hold.

**What linkage unlocks:** per asset/works — *"WINEP requires X by `<completionDate>`; proposed permit
DWF `<current→proposed>`"* — i.e. the **promised fix + deadline + the FFT/DWF permit gap filled from
the proposed values**.

## 3. Where companies publish their WINEP response
The WINEP dataset **is** the company-agreed action set — EA-issued and accepted ("Proceed"), so
"what SWW will do" = filter `waterCo = 'South West Water'` (782 rows). Companies also restate these
in **PR24 business plans, Drainage & Wastewater Management Plans (DWMPs)**, and per-company ODI /
performance pages (e.g. delivery-of-WINEP commitments), but the **canonical, machine-readable,
all-company source is the national WINEP dataset**. No need to scrape 19 companies separately.

## 4. EA monitoring of *previously-implemented* WINEP actions (delivery)
This is the **least machine-readable strand** — worth stating plainly:
- **In-dataset:** `completionDate` (planned deadline) + `optionsAssessmentOutcome`.
- **Delivery/completion** is reported in aggregate via the EA **Environmental Performance
  Assessment (EPA)** annual report — the **WINEP %-completion metric** (e.g. **97.0%**, 5,777/5,958
  schemes met within deadline for FYE Mar 2025; "green status" target) — plus **Ofwat's Annual
  Performance Review / ODIs**. These are report/PDF + metric, **not a clean per-action completion
  API**.
- **PR19 dataset** = what was *due* in 2020–25; comparing it to EPA completion shows the
  delivered-vs-missed picture.
- **Advocacy hook:** because per-action delivery isn't openly published as data, *holding companies
  to the published `completionDate`* (promise-vs-delivery) is itself a campaign lever — River Hub
  can surface "due by X, EA reports the company at Y% overall" and prompt FOI/EIR on specific schemes.

## 5. National datasets → per-catchment rollout
WINEP is **national, geocoded, water-body-tagged** — i.e. another **national connector**, exactly
like the ones the hub already rides. The full national-data stack now identified for any English
catchment:

| Layer | National source | Per-catchment filter |
|---|---|---|
| Sewage assets + spill history | EA all-years EDM FeatureServer | bbox / water company |
| Live spills | water-company EDM feed | catchment polygon |
| Rainfall / river flow | EA Hydrology | bbox / nearest gauge |
| Boundaries + population | ONS | bbox / LAD |
| Water bodies + catchments | EA WFD ArcGIS | opcat ids |
| River network | OSM Overpass | bbox |
| **WINEP actions + permits + deadlines** | **PR24/PR19 WINEP ArcGIS** | **`waterCo` + bbox / `wbID`** |

So a new instance's `catchment.config` (water-company + WFD ids + bbox — already how F3 works) is
**sufficient to pull its WINEP slice too**: add an `import_winep.py` step that filters the national
layer by company + bbox/water-body and links to assets. Nothing catchment-specific is hand-built —
the rollout model holds.

## Recommended next build
1. **`import_winep.py`** (config-driven, FeatureServer-primary, same pattern as `import_edm.py`):
   pull PR24 (+ PR19) actions for the catchment, link to assets by name/wbID/proximity.
2. **`winep_actions` table** — action id, driver code (+ decoded label), name/description, deadline,
   receptor links, current→proposed permit values, asset_id (nullable), geometry, cycle (PR19/PR24).
3. **Surface it**: per-asset "Planned improvements (WINEP)" panel (what's promised, by when, proposed
   permit change) — which **doubles as the Commitments tracker** from the original spec and **fills
   the FFT/DWF permit gap** with the *proposed* values; a catchment WINEP summary (drivers, deadlines,
   storm-overflow count); and a promise-vs-delivery view using the EPA completion metric.
4. On the dossier, note any WINEP action already committed for that asset ("an improvement is due by
   `<date>` — is it on track?").

This turns the hub from "here's what's spilling" into "here's what's spilling, what's been promised,
by when, and whether it's been delivered" — the full advocacy loop.

---

Sources:
- [PR24 WINEP dataset (data.gov.uk)](https://www.data.gov.uk/dataset/cf9b80c2-cae9-4ed1-88ce-890940be379a/pr24-water-industry-national-environment-programme)
- [PR24 WINEP (environment.data.gov.uk)](https://environment.data.gov.uk/dataset/39b11ea0-3cfa-4cbb-b3a1-b5950019f169) · [PR19 WINEP](https://environment.data.gov.uk/dataset/7e8173ec-603e-44d5-aa87-ca062a8a51c8)
- [WINEP methodology (GOV.UK)](https://www.gov.uk/government/publications/developing-the-environmental-resilience-and-flood-risk-actions-for-the-price-review-2024/water-industry-national-environment-programme-winep-methodology)
- [Water & sewerage companies environmental performance report 2024 — WINEP completion metric (GOV.UK)](https://www.gov.uk/government/publications/water-and-sewerage-companies-in-england-environmental-performance-report-2024/water-and-sewerage-companies-in-england-environmental-performance-report-for-2024)
- PR24 WINEP geocoded layer (Rivers Trust mirror): `services3.arcgis.com/Bb8lfThdhugyc4G3/.../PR24_Water_Industry_National_Environment_Programme/FeatureServer/0`; EA Driver Codes: `services1.arcgis.com/JZM7qJpmv7vJ0Hzx/.../DriverCodes/FeatureServer`
