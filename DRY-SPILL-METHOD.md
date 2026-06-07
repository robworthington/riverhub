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
- ❌ We do **not** hold per-works flow-to-treatment (FFT) telemetry, so we test the **rainfall limb**
  of compliance only (was it exceptional weather?), not the pass-forward limb.

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

## 6. Proposed implementation in River Hub
- A SQL view / function `spill_weather_class(R_mm, N)` joining `spill_events` ↔ `rainfall_readings`
  (asset's gauge) ↔ `flow_readings`, returning the classification + evidence per event.
- Asset detail: badge each spill event **Dry / Wet** with the rainfall figures on hover.
- A **"Dry-weather spills" report/page**: catchment-wide list + counts per asset/system, filterable
  by year and by antecedent window (1 / 3 / 4 days), exportable — the headline advocacy artefact.
- Optional: per-asset rain-gauge mapping (§4) as a follow-up to improve precision.

## Key sources
- Ofwat, *Decision to accept s.19 undertakings from South West Water* (2025) — Reg 4(4), dry-day definition, Formula A.
- EA blog, *What are dry day spills?* (28 Aug 2024).
- Hammond et al., *Detection of untreated sewage discharges to watercourses using machine learning*, npj Clean Water 4:18 (2021).
- *Storm Overflow Assessment Framework* — SOAF 2018 (water.org.uk) & SOAF 2025 (gov.uk).
- Defra, *Storm Overflows Discharge Reduction Plan* (2022).
- *Manchester Ship Canal Co Ltd v United Utilities Water Ltd (No 2)* [2024] UKSC 22.
- OEP, investigation into CSO regulation (2023–2024).
- Windrush Against Sewage Pollution — data analysis (windrushwasp.org/data-analysis).
