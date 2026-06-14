# Detecting "dry spills" — a River Hub methodology

A repeatable method to flag storm-overflow spills that occur in **dry weather on or before the day
of the spill** — i.e. discharges not justified by the "exceptional rainfall" that permits require,
and therefore **presumptively non-compliant**. Grounded in EA/Ofwat practice, the Hammond et al.
academic method, and English law. (Evidence base: deep-research report, 2026-06-07.)

## 1. Why a dry spill matters (legal basis)
Untreated storm-overflow/CSO discharges are lawful **only in exceptional circumstances** (typically
unusually heavy rainfall), subject to BTKNEEC:
- **Urban Waste Water Treatment (England & Wales) Regs 1994, Reg 4(4)** — spills only in
  "exceptional or unforeseeable cases (accounting for seasonal variations), subject to BTKNEEC".
- **Water Industry Act 1991** ss.18, 94; permits issued under the **Environmental Permitting
  (E&W) Regs 2016**.
- Each permit sets a **pass-forward flow (PFF) / flow-to-full-treatment (FFT)** threshold the works
  must keep treating *even while spilling*. FFT/PFF is derived from **Formula A** (overflow setting
  = DWF + 1360·P + 2E; DWF = P·G + I + E; FFT commonly = 3·P·G + Imax + 3E ≈ "3 DWF").
- Spilling in **sub-exceptional rainfall**, or while passing forward **less than FFT**, is
  non-compliant (Hammond et al.; Ofwat).
- Enforcement context: **Ofwat found South West Water breached Reg 4(4) & s.94** (£24m redress);
  the **EA's largest-ever criminal investigation** is ongoing; **Manchester Ship Canal v United
  Utilities [2024] UKSC 22** opened private nuisance/trespass claims for unauthorised discharges;
  the **OEP** found Defra/EA/Ofwat failed to comply with the law.

> A dry-weather spill is the clearest, most defensible signal of likely non-compliance a community
> group can compute from open data.

## 2. Established definitions (what others use)
| Source | "Dry spill" definition | Notes |
|--------|------------------------|-------|
| **EA / Ofwat** (operational) | Spill on a day with **< 0.25 mm rainfall in the *upstream catchment* on that day and the preceding 24 h** | The authoritative regulator definition (Ofwat s.19 notices; EA blog 28 Aug 2024). |
| **Hammond et al. 2021** (npj Clean Water) | A 24 h spill with **no rainfall on the spill day nor the previous day** | Attributed such spills to (unpermitted) groundwater ingress. |
| **BBC / some campaigns** | No significant rain over the **preceding ~4 days** | Stricter antecedent window; a *different* methodology — don't conflate. |
| **SOAF "exceptional" exclusion** | Years in the **top 5%** rainfall band are excluded from spill-frequency triggers | Defines the opposite end: when frequent spilling *is* weather-driven. |

Supporting context: **SOAF 12/24 spill counting** (first 12 h block = 1 spill; each further 24 h
block = +1; resets after 24 h dry); **SODRP 2050 backstop** of ≤10 rainfall events/yr.

## 3. River Hub method

### Data we hold (and gaps)
- ✅ `spill_events` — per asset: `event_start`, `event_end`, `duration_minutes`.
- ✅ `rainfall_readings` — **daily** totals (mm) per EA gauge (currently *Holne Priddons Farm* for
  the whole Dart).
- ✅ `flow_readings` — daily mean river flow (Austins Bridge) — used as corroboration.
- ✅ `sewage_systems` + `spills_ahead_of_works()` — which upstream assets discharge while their
  treatment works' own overflow stayed shut (capacity was available) — see §7.
- ✅ **Sensitive-water flags** per outlet — `bathing_water` and `shellfish_water` come through on the
  EA EDM FeatureServer (populated where the overflow has a Bathing/Shellfish Water EDM requirement);
  imported onto the asset — see §6.
- ❌ We do **not** hold per-works flow-to-treatment (FFT) telemetry, so we test the **rainfall limb**
  of compliance only (was it exceptional weather?), not the pass-forward limb.
- ❌ We do **not** yet hold designated-water **boundaries** (bathing/shellfish/SSSI/chalk-stream
  geometries) for proper downstream-proximity modelling — a planned data layer (§6, backlog).

### Algorithm (per spill event)
1. `spill_day = date(event_start)`.
2. Pull daily rainfall for `spill_day` and the **N antecedent days** from the asset's matched gauge.
3. Classify (configurable threshold `R_mm`, default **0.25 mm**; antecedent window `N`, default **1**):
   - **Dry spill** if rainfall ≤ `R_mm` on `spill_day` **and** on each of the preceding `N` days.
   - **Wet spill** otherwise.
   - **Exceptional** (optional) if rainfall on/around the spill day is in the catchment's top-5%
     daily band → explicitly *permitted*-type.
4. **Corroborate** with flow: attach Austins Bridge mean flow on `spill_day`; a dry spill coinciding
   with low/baseflow strengthens the finding (and helps separate rainfall-driven from
   groundwater-ingress spills).
5. **Output** per event: `weather_class ∈ {dry, wet, exceptional}`, the rainfall figures used, the
   gauge, flow, and a `presumptively_non_compliant` flag (= dry).

### Recommended defaults & sensitivity
- **Primary = EA definition**: `R_mm = 0.25`, `N = 1` (spill day + preceding day). Matches the
  regulator; daily data faithfully implements "that day and the preceding 24 h".
- **Report a sensitivity band**: also compute `N = 0` (Hammond-strict, rain-free spill day only is
  not enough — keep `N=1`), and `N = 3` and `N = 4` (campaign-style) so a spill can be labelled
  "dry even on a 4-day window" — the most robust, hardest-to-dispute category.
- **Rainfall→spill lag**: the antecedent window *is* the lag treatment (heavy rain 1–2 days prior
  can still drive a spill via saturated ground). Larger `N` = more conservative (fewer false
  "dry" flags).

## 4. Station matching (important)
The EA tests rainfall in each overflow's **upstream catchment**. We currently use one Dart gauge
for all assets — adequate for a first pass, but:
- **Recommended:** map each asset to its **nearest representative EA rain gauge** (point-in-catchment
  / nearest-gauge), store `rainfall_station_id` on the asset, and test against that gauge.
- Add more EA Hydrology rain gauges to `rainfall_stations` so upland (Dartmoor) vs lowland assets
  use locally-relevant rainfall.

## 5. Caveats (state these whenever reporting)
- **Rainfall limb only** — we can't see FFT/pass-forward, so a "dry spill" is *presumptively*
  non-compliant under Reg 4(4), not proof of an offence.
- **Groundwater ingress** can cause genuinely rain-free spills that are still unpermitted (Hammond)
  — so dry spills are a *strong investigate signal*, consistent with the law.
- **Daily granularity & single gauge** — coarser than the EA's catchment-rainfall method; the 4-day
  window mitigates gauge/timing error.
- **Versioned thresholds** — cite the relevant SOAF version (2018 vs 2025) when referencing triggers.

## 6. Severity dimension A — proximity to higher-priority waters
A dry spill is not just *whether* but *where*. One discharging just above a designated **bathing
water**, **shellfish water**, **chalk stream**, drinking-water abstraction, or SSSI/SAC is a higher
public-health and ecological priority than one on a remote moorland brook — and the law already
treats these waters as more sensitive (bathing-season EDM duties, Shellfish Water Protected Areas).

- **Data anchor we already have:** the EA EDM FeatureServer tags each outlet with `bathing_water`
  and `shellfish_water` where the overflow carries that EDM requirement (imported onto the asset).
  That alone lets us flag "dry spill at a bathing-water overflow" today.
- **Proper model (to design later):** load the designated-water **geometries** (EA Designated
  Bathing Waters, Shellfish Water Protected Areas, WFD protected areas, chalk-stream and SSSI/SAC
  layers) and compute, per dry-spill asset, the **downstream distance/flow-time to the nearest
  sensitive receptor** — using the loaded `river_segments` network for downstream path rather than
  crow-flies. Weight a **receptor-priority score** by designation type, proximity, and whether the
  spill fell in **bathing season** (May–Sep).
- **Output:** a "receptor risk" tag on each dry spill and a priority sort, so advocacy leads with
  the spills that most plausibly reached water people swim in or harvest shellfish from.
- *Status:* the bathing/shellfish flag is available now; the geometry layers and downstream-distance
  model are a **backlog data layer** — modelled later (this section is the placeholder for it).

## 7. Severity dimension B — spilling "ahead of the works" (system context)
We model **sewage systems** and already compute `spills_ahead_of_works()`: for each system, upstream
CSO / pumping-station spills that occur on days the system's **treatment-works own overflow stayed
shut** — i.e. the works still had treatment capacity, so the upstream discharge points to a network
hydraulic bottleneck or a **premature / avoidable** spill rather than a genuine capacity-overwhelmed
event.

- **Cross this with the dry/wet class.** The most serious category is a spill that is **both dry
  *and* ahead of the works**: untreated sewage discharged in dry weather *while treatment capacity
  was available* — hard to reconcile with "exceptional circumstances" under Reg 4(4).
- Conversely, a **works-inlet** storm overflow (inlet SO / storm tank) spilling in dry weather
  points at the **works itself** (under-capacity or fault), a different — also actionable — finding.
- **Build:** a compound severity flag combining `classify_spills` (dry) × `spills_ahead_of_works`
  (ahead), surfaced at **system** level, not just per asset — so the narrative is "this network
  discharges raw sewage upstream of its works, in dry weather" rather than an isolated outlet stat.

## 8. EA method vs a public-interest interpretation (advocacy framing)
River Hub exists partly to **advocate for changes to law and policy**, so it should make the gap
between the *regulator's* accounting and a *public-health / precautionary* reading **explicit and
quantified** — always showing the EA-canonical figure (for credibility) alongside the alternative,
with the **delta** as the headline.

| Dimension | EA / official method | Where it understates harm → River Hub public-interest view |
|---|---|---|
| **Spill metric** | 12/24-hour **count** (blocks; capped 366/yr) | A "1-spill" block can be 24 h continuous. Lead with **duration / discharge-hours**, not just count. |
| **Dry threshold** | ≤0.25 mm, spill day + preceding 24 h | Lenient on antecedent saturation. Also report the **3–4-day-dry** count — spills "dry even on a 4-day window" are the hardest to excuse. |
| **"Exceptional" rainfall** | SOAF top-5% rainfall years **excused** from triggers | Removes the worst events from the headline. Public view **counts all** and shows what's excluded. |
| **Where it goes** | Location-blind count | Weight by **receptor proximity** (§6) — a dry spill above a bathing water ≠ one on a moor. |
| **Network context** | Per-outlet count | Flag **ahead-of-works / avoidable** discharges (§7). |
| **Compliance limb** | Permit (Formula A FFT/PFF) framing | We test the **rainfall limb** transparently; name the pass-forward limb we *can't* see. |

**Design:** a side-by-side **"EA-reported vs River Hub precautionary"** comparison per asset /
system / catchment — e.g. *"EA Annual Return: 42 counted spills. On a precautionary basis: 310
discharge-hours, of which 70 h in dry weather, 28 h ahead of the works, all upstream of a
designated bathing water."* The official number anchors credibility; the gap is the policy argument.
Every alternative figure must state its method and link the versioned methodology (§9 / dossier).

## 9. Proposed implementation in River Hub
- A SQL view / function `spill_weather_class(R_mm, N)` joining `spill_events` ↔ `rainfall_readings`
  (asset's gauge) ↔ `flow_readings`, returning the classification + evidence per event.
- Asset detail: badge each spill event **Dry / Wet** with the rainfall figures on hover.
- A **"Dry-weather spills" report/page**: catchment-wide list + counts per asset/system, filterable
  by year and by antecedent window (1 / 3 / 4 days), exportable — the headline advocacy artefact.
- Per-event **evidence dossier** + filtering, duration display and robustness extras — see
  `DRY-SPILL-UX-PROPOSAL.md`. The dossier should carry the §6 receptor flag, the §7 ahead-of-works
  flag, and the §8 EA-vs-precautionary comparison.
- Per-asset rain-gauge mapping (§4) and the §6 designated-water layers as follow-up data work.

## Key sources
- Ofwat, *Decision to accept s.19 undertakings from South West Water* (2025) — Reg 4(4), dry-day definition, Formula A.
- EA blog, *What are dry day spills?* (28 Aug 2024).
- Hammond et al., *Detection of untreated sewage discharges to watercourses using machine learning*, npj Clean Water 4:18 (2021).
- *Storm Overflow Assessment Framework* — SOAF 2018 (water.org.uk) & SOAF 2025 (gov.uk).
- Defra, *Storm Overflows Discharge Reduction Plan* (2022).
- *Manchester Ship Canal Co Ltd v United Utilities Water Ltd (No 2)* [2024] UKSC 22.
- OEP, investigation into CSO regulation (2023–2024).
- Windrush Against Sewage Pollution — data analysis (windrushwasp.org/data-analysis).
