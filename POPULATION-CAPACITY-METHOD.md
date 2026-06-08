# Estimating served population & comparing capacity — a River Hub methodology

A repeatable, defensible method to (a) estimate **how much sewage a sewage system is expected to
receive** from the population it serves, (b) express that as a **range** that honestly accounts for
homes *not* on the sewer and for **tourist/seasonal influx**, and (c) compare that demand against
the **capacity the permit requires** and the **actual installed capacity** of the works.

Three numbers fall out of this, to be brought into the data model per asset/works:

| Field | Meaning | Source of truth |
|-------|---------|-----------------|
| **Population demand (m³/day)** | Wastewater flow the served population is expected to generate (a low–high range) | Computed by River Hub from census + per-capita allowance |
| **Permit requirement (m³/day)** | What the regulator's permit requires the works to treat / pass forward (DWF, FFT/PFF) | The EA permit (public register / EIR) |
| **Actual capacity (m³/day)** | What the works is physically built to treat | Water company / EA via **EIR request** |

> Evidence base: deep-research report, 2026-06-08 (24 verified claims, primary EA/ONS/Ofwat/ICO
> sources) plus targeted follow-up for the per-capita and adjustment figures. Citations inline.

---

## 1. The per-capita formula and its source

The Environment Agency's standard design relationship for the flow a works must handle is **Dry
Weather Flow**:

```
DWF = P·G + I + E        (litres/day)
```

| Term | Definition | Unit |
|------|-----------|------|
| **P** | Catchment population served | persons |
| **G** | **Per-capita domestic flow** — the per-person sewage allowance | l/head/day |
| **I** (I_DWF) | Infiltration of groundwater into the sewer in dry weather | l/day |
| **E** | Trade (non-domestic / industrial) effluent flow | l/day |

**Source (primary):** EA, *Calculating dry weather flow (DWF) at waste water treatment works*
(GOV.UK) — states the formula and term definitions verbatim. Reproduced in the EA *storm and
emergency overflow permit* guidance and the **Ofwat South West Water s.19 decision (2025)**.

Two derived thresholds the same EA guidance defines (already used in `DRY-SPILL-METHOD.md`):

```
Formula A (storm-overflow setting) = DWF + 1360·P + 2E      (min flow retained while spilling)
FFT  (flow to full treatment)      = 3·P·G + I_max + 3E  ≈  3·DWF   ("3 DWF" rule of thumb)
```

> ⚠️ **FFT is not "the maximum the plant can treat."** It is the peak flow that must be *fully
> treated before a storm overflow may legitimately spill*. (This claim was explicitly refuted 0-3
> in the research; a common blog misconception.) Actual installed capacity can differ — hence the
> separate "Actual capacity" field, obtainable only via EIR.

### 1a. The value of G (the key per-person number)

**There is no single statutory national default for G.** The EA guidance is explicit that G is
determined **per catchment from measured/assumed per-capita consumption**, using local flow data
where available. So River Hub treats G as a **defensible assumed range**, not a constant:

| Basis for G | Value | Source |
|-------------|-------|--------|
| Measured average per-capita water consumption, England | **~140 l/person/day** (136.5 Defra OIF E8; 139.5 Water UK 2023/24) | Defra Outcome Indicator Framework E8; Water UK / Discover Water |
| Less return-to-sewer factor (typically ~90–95% of water used returns as sewage) | **~125–135 l/head/day** | Standard sewerage design assumption |
| Traditional sewerage **design** figure (older works, with margin) | **~180 l/head/day** | Long-standing UK design practice (e.g. WaPUG/IWEM) |

**River Hub convention:** use **G = 140 l/head/day** as the central estimate (current measured
consumption, conservatively assuming ~100% return to sewer), and report sensitivity at
**120 and 180 l/head/day**. Always state G alongside the result so it is auditable.

### 1b. Population Equivalent (PE) — the *load* (not flow) measure

Capacity and permit standards are often expressed in **Population Equivalent**, a load measure:

```
1 PE = the organic load with a 5-day BOD (BOD5) of 60 g of oxygen per day,
       based on the maximum average weekly load entering the works in the year
       (excluding unusual situations e.g. heavy rain).
```

**Source (primary):** UWWTD **91/271/EEC Article 2(6)**, transposed into England & Wales law by
**SI 1994/2841** (the Urban Waste Water Treatment (England & Wales) Regulations 1994), reg 2(1);
restated in EA *Waste water treatment works: treatment monitoring and compliance limits* guidance.
The 60 g BOD5/day figure is retained in the recast Directive (EU) 2024/3019.

Useful corollaries (verified, primary):
- The level of treatment/monitoring a works must provide **depends on the PE of the agglomeration**
  it serves; the PE must represent the **highest BOD load** entering the works.
- Works serving **< 250 PE** typically have **descriptive (qualitative) permits**, not numeric
  limits — relevant to the small Dart-headwater works.
- **Total PE = resident domestic population + an equivalent population converted from trade loads**
  (Ofwat SWW s.19 decision — directly South West Water). So both flow (P·G) and load (PE) scale
  with catchment population **P**, which is what we estimate next.

---

## 2. Estimating the resident (on-mains) population — P

We estimate P from **ONS open small-area data**, apportioned to the **sewer catchment polygon**.

1. **Small-area population.** Use Census 2021 **Output Areas** (OAs — the lowest geography, 40–250
   households / **100–625 usual residents**) for the residential build, and **LSOA mid-year (30
   June) estimates** (accredited official statistics) for currency/age breakdown.
   *Sources (primary):* ONS Census 2021 geographies; ONS LSOA mid-year population estimates.

2. **Apportion to the catchment polygon** by **areal interpolation**:
   - *Areal weighting* allocates each OA's population to the catchment in proportion to the
     intersected area; it is **volume-preserving** (the parts sum to the OA total). Weakness: it
     assumes population is spread **uniformly** within the OA.
   - *Dasymetric refinement* improves this by weighting with ancillary data (e.g. residential
     land-use / building footprints) to exclude fields, moors and water before apportioning.
   *Sources (primary):* Comber et al. 2019 (Geography Compass, doi 10.1111/gec3.12465); the
   published **"Wastewater catchment areas in Great Britain"** method applies exactly this to
   >96% of the England & Wales population.

3. We already hold the spatial machinery for this in River Hub (PostGIS catchment polygons +
   point-in-polygon from `CATCHMENT-METHOD.md`); the same `ST_Intersection` / area-ratio approach
   apportions OA populations.

This yields **P_resident** for the catchment.

---

## 3. The two adjustments that make P a *range*

A single number would be indefensible. We build a **low–high band**:

### 3a. Off-mains properties (pull the LOW end down)
Not every dwelling in the catchment drains to the public sewer; rural Dart properties on **septic
tanks / package treatment plants** must be **excluded** from the served population.

- Nationally **~95% of properties are on mains** (so **~5% off-mains**), **~1.5 million UK
  properties** on private systems — but these concentrate in **rural areas**, so the local share in
  the upper Dart can be materially higher. *(Industry/Defra figures; treat the 5% as a floor.)*
- **Defensible practice:** don't apply a blanket %. Where possible, **count dwellings actually
  connected** by intersecting the catchment with the **public-sewer network / mapped connections**,
  or subtract OAs/postcodes known to be off-mains. Absent that, apply a **rural off-mains
  assumption (e.g. 5–15%)** and state it.

→ **Low estimate P_low = on-mains resident population only.**

### 3b. Tourism, second homes & short-term lets (push the HIGH end up)
Devon is a major visitor destination; in season the *served* population far exceeds the resident
count.

- **Devon: ~23.4 million staying visitor-nights/year** (Visit Devon / South West Research Co.) —
  averaging ≈ 64,000 extra people present per night county-wide, heavily **peaked in summer**.
- **Second homes / holiday lets:** Devon districts now levy the **100% council-tax second-home
  premium (from 1 Apr 2025)**, so **council-tax second-home and holiday-let records** give a
  per-area count of dwellings that are occupied only seasonally. Short-term-let registration data
  adds further granularity.
- **Defensible practice:** estimate a **peak-season uplift** for the catchment from (i) visitor
  bed-stock (caravan/holiday parks, campsites, hotels, registered lets) within the polygon × peak
  occupancy, plus (ii) second-home dwellings × peak occupancy × average household size. Add to the
  resident base.

→ **High estimate P_high = on-mains residents + peak seasonal visitors/second-home occupants.**

> The honest headline is a **range P_low–P_high**, with the central case stated and every factor
> (G, off-mains %, peak uplift) recorded so a regulator or the water company can audit it.

---

## 4. From population to the three data-model numbers

### (1) Population demand (m³/day) — *computed by River Hub*
```
Demand_low  (m³/day) = P_low  · G / 1000
Demand_high (m³/day) = P_high · G / 1000
```
(Optionally add measured infiltration I and known trade effluent E to compare against DWF directly;
for storm-capacity questions compare against **FFT ≈ 3·DWF**.) Store **low, central, high** and the
**assumptions used** (G value, off-mains %, peak uplift, date).

### (2) Permit requirement (m³/day) — *from the EA permit*
The figure(s) the permit obliges the works to handle — typically the **consented DWF** and the
**FFT / pass-forward flow**, and/or the **design PE**. Read from the **EA public register** /
permit document. We already capture `required_processing_volume` and `required_storage_capacity`
on `asset_permits`; this is where the permit DWF/FFT lives, with the permit PDF/EA link attached.

### (3) Actual installed capacity (m³/day) — *via an EIR request*
The physical built capacity is **not** generally published and **not** equal to FFT. Obtain it by an
**Environmental Information Regulations 2004 (EIR)** request to **South West Water** (and/or the EA):

- All UK water companies have a **legal duty under EIR** to respond to environmental-information
  requests and to publish proactively; the **ICO treats wastewater-treatment-works performance data
  as disclosable environmental information** and has issued decision notices **including against
  South West Water**. *(Sources: ICO statement, Apr 2025; EIR 2004 SI 2004/3391, regs 4–5; Fish
  Legal v IC [2015] UKUT 0052.)*
- **Ask for:** design/installed flow capacity (m³/day and l/s), design PE, FFT setting and basis,
  DWF used, storm-tank volume, and the date/basis of the last capacity review.

### The comparison this enables
```
If  Population demand (m³/day)  >  Permit requirement   → works likely permitted below real demand
If  Permit requirement         >  Actual capacity       → works can't meet even its own permit
If  Population demand (high)    >  Actual capacity       → seasonal overload → spills expected
```
This is the defensible, fully-cited story: *the population (with tourism) demands X; the permit only
requires Y; the works can actually only treat Z.*

---

## 5. Data-model design (decided 2026-06-08 — editable per-system assumptions)

Population demand is a **catchment** property, so the tunable assumptions attach to the
**sewage system** (1:1 table), not individual assets. ONS supplies the base **P**; local knowledge
tunes everything via an editable form; the **low/high band is expressed as a ± % variation** so it
can be adjusted by hand. Permit requirement and actual capacity stay on the **works asset**.

```sql
-- 1:1 with sewage_systems; org-scoped + RLS (admin write, org read)
create table system_assumptions (
  system_id           uuid primary key references sewage_systems(id) on delete cascade,
  organisation_id     uuid not null references organisations(id),
  -- P (resident base): ONS-derived, refreshable, with a manual override
  ons_population      int,
  ons_calculated_at   timestamptz,
  population_override int,                              -- local knowledge beats ONS when set
  -- tunable assumptions (editable in UI; defaults below)
  g_lhd               numeric not null default 140,     -- per-capita flow l/head/day (central)
  low_variation_pct   numeric not null default 15,      -- LOW end: subtract this % (off-mains etc.)
  high_variation_pct  numeric not null default 50,      -- HIGH end: add this % (tourism/2nd homes)
  infiltration_m3d    numeric default 0,                -- optional I
  trade_effluent_m3d  numeric default 0,                -- optional E
  notes               text,                             -- record the local reasoning
  updated_by          uuid references profiles(id),
  updated_at          timestamptz not null default now()
);
```

**Defaults (decided):** `g_lhd = 140`, `low_variation_pct = 15`, `high_variation_pct = 50`
(rural-Devon starting band; tune per system). **P source (initial):** parish-based ONS estimate —
apportion Census 2021 Output Area population via the parishes the system's assets fall in (reuses
the existing 63 parish polygons + heat-map machinery); refine to true sewer sub-catchments later.

**Computation (exposed via a `system_capacity_v` view — generated columns can't chain):**
```
effective_P        = COALESCE(population_override, ons_population)
P_low              = effective_P × (1 − low_variation_pct/100)
P_high             = effective_P × (1 + high_variation_pct/100)
demand_central_m3d = effective_P × g_lhd / 1000  (+ infiltration_m3d + trade_effluent_m3d)
demand_low_m3d     = P_low       × g_lhd / 1000  (+ I + E)
demand_high_m3d    = P_high      × g_lhd / 1000  (+ I + E)
```

**Permit requirement & actual capacity (on the works asset):** extend `asset_permits` /
`sewage_assets` with `permit_dwf_m3d`, `permit_fft_m3d`, `permit_pe` (from the EA permit) and
`actual_capacity_m3d`, `actual_capacity_source`, `eir_ref`, `eir_requested_on`, `eir_received_on`
(EIR-sourced). The system page joins these for the three-way comparison.

---

## 6. Honest limitations
- **G is an assumption, not a measured local value** — always reported with the result; the central
  140 l/head/day reflects today's metered consumption, older design used ~180.
- **Off-mains share** is best derived from connection data, not a blanket %; the 5% national figure
  understates rural Devon.
- **Peak uplift** depends on bed-stock and occupancy assumptions that vary year to year; report the
  basis and the season.
- **PE vs flow:** permits may be set in PE (load) while demand here is in flow (m³/day); keep the two
  measures distinct and convert only with stated assumptions.

## Primary sources
- EA, *Calculating dry weather flow (DWF) at waste water treatment works* — GOV.UK
- EA, *Water companies: environmental permits for storm overflows and emergency overflows* — GOV.UK
- EA, *Waste water treatment works: treatment monitoring and compliance limits* — GOV.UK
- UWWTD **91/271/EEC** Art 2(6); **SI 1994/2841** (legislation.gov.uk); recast Dir. (EU) 2024/3019
- Ofwat, *Decision to accept s.19 undertakings from South West Water* (2025)
- ONS Census 2021 geographies; ONS LSOA mid-year population estimates
- Comber et al. 2019, *Geography Compass* (doi 10.1111/gec3.12465); GB wastewater-catchment method
- Defra Outcome Indicator Framework **E8** (per-capita consumption); Water UK / Discover Water
- Visit Devon / South West Research Company visitor-economy figures; Devon district second-home
  council-tax premium notices (2025)
- ICO, *Transparency must be the default for water companies* (Apr 2025); **EIR 2004 SI 2004/3391**;
  Fish Legal v IC [2015] UKUT 0052
