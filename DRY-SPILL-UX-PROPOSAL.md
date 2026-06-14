# Dry-spill handling — analysis & proposed changes

*Design proposal, 14 June 2026. Companion to `DRY-SPILL-METHOD.md` (the classification method,
unchanged here). This covers presentation, filtering, per-event evidence and robustness. Not yet
implemented — for review.*

## Current state (what we have)

- `classify_spills(window, threshold, asset, year)` labels each `spill_events` row **dry / wet /
  unknown** vs the matched gauge's rainfall; exposes `duration_minutes`, `max_rain`, `flow_m3s`.
- `dry_spill_summary(...)` aggregates per asset. Dry-spills page = per-asset table + window/year
  filters; asset page lists recent events with a weather badge; public portal has a spills table.
- Duration is shown only as **whole hours** (annual `total_duration_hours`) or not at all per event.
- **No minimum-duration filter** — every event is classified and shown, including 15-minute blips.
- Already links to `DRY-SPILL-METHOD.md` on GitHub.

---

## 1. Minimum-duration threshold — what the evidence says

**There is no official minimum-duration cutoff.** Confirmed from EA/Ofwat/water-company sources:

- "Environmental Permit Conditions do not contain a requirement for a level of data availability,
  quality or a maximum spill frequency or duration."
- The EA standardises **counting**, not duration, via the **DEFRA 12/24-hour method**: the first
  discharge opens a 12-hour block = 1 spill; each subsequent 24-hour block with discharge = +1;
  counting resets after a 24-hour dry block. Max 366/yr. This is what the **Annual Returns** report
  (alongside total duration in hours) — they contain no per-event duration floor.
- The natural floor is the **monitor's reporting resolution**: **15 minutes** standard, **2 minutes**
  for monitors on high-amenity (e.g. bathing/shellfish) waters. A spill recorded as a single
  interval *is* counted, but "each reading indicating a spill is counted as the whole 15-minute
  interval, although the spill may have occurred for less time" — i.e. a single-interval event is
  the **least precise and most disputable** unit (sensor noise, brief testing, tidal influence on
  coastal monitors).

**Recommendation:**
1. **Do not change the count methodology.** Keep the EA 12/24-hour counts and Annual-Return totals
   as the canonical headline figures — diverging from the regulator would weaken, not strengthen,
   the evidence. Reconciling to the EA is the whole point.
2. Introduce a configurable **`min_duration_minutes`** used as a **display / evidence-strength**
   control, not a re-count. Default **15 minutes** (one standard monitor interval) — i.e. by
   default hide single-interval blips from the *evidence* lists, because a dry spill you take to a
   regulator should be a confirmed multi-interval discharge. Make it instance-config (a 2-minute
   coastal catchment might set 2–4 min).
3. Treat duration as an **evidence-strength axis**, not a validity gate: a 6-hour dry spill is far
   harder to dispute than a 15-minute one. Feed it into the confidence score (§6).

---

## 2. Default-on "hide short spills" filter (toggleable)

- Add an optional **`p_min_minutes`** parameter to `classify_spills` / `dry_spill_summary`
  (default 0 in the function; the **UI defaults it to 15**).
- UI control on the **dry-spills page, asset page, and public spills page**: a toggle
  **"Hide spills under 15 min"** — *on by default*, with a one-click **"Show all spills"**.
  Persist via `?minMins=` so a chosen view is shareable/linkable.
- Always show, near the toggle, both figures so nothing is hidden silently:
  *"Showing 142 spills ≥15 min · 31 shorter spills hidden"*. Never silently drop data — surface the
  count of what's filtered (consistent with the project's no-silent-truncation rule).

---

## 3. Adaptive duration display (d / h / m / s)

- New `formatDuration()` util (in `src/lib/`), adaptive by magnitude:
  - ≥ 1 day → `4 d 6 h`
  - ≥ 1 hour → `6 h 12 m`
  - ≥ 1 min → `14 m 30 s`
  - < 1 min → `45 s`
  - (a `long` variant — "4 days 6 hours" — for the dossier prose.)
- **Source precision:** `spill_events.duration_minutes` is whole minutes; for second-level
  granularity compute from `event_end − event_start` (timestamps we already hold), falling back to
  `duration_minutes` when an event is ongoing or lacks an end. Annual `total_duration_hours` stays
  hours (that's the EA's unit) but render as `formatDuration` too (e.g. `3,037 h → 126 d 13 h`).
- Apply everywhere duration appears: event lists, chart tooltips, the dossier.

---

## 4. Per-spill-event evidence dossier page

A dedicated, **print-ready** page per event — the single most valuable addition. Route
`/assets/[id]/spills/[eventId]` (members; a redacted public variant later).

Backed by a new `spill_event_evidence(p_event uuid, window, threshold)` RPC returning everything in
one call:

- **The discharge:** asset name/type/permit, outlet id, `event_start` → `event_end`, duration
  (d/h/m/s), ongoing flag, EDM data source + capture time.
- **Classification:** dry/wet, the threshold + antecedent window used, and the **classification
  across all three windows (1 / 3 / 4-day)** so the page states e.g. *"Dry on the spill day and the
  preceding 4 days."*
- **Rainfall evidence:** the matched gauge, and a **small bar chart / table of daily rainfall** for
  the spill day + preceding N days (the actual mm figures the classification used).
- **Proximity map:** asset marker + nearest rain-gauge marker + a connecting line labelled with the
  **distance (km)**, so a reader can judge gauge representativeness at a glance.
- **Corroboration:** river flow (Austins Bridge etc.) on the day — baseflow vs spate.
- **Provenance & method:** data sources (EA EDM, EA Hydrology gauge id), retrieval dates, and a
  **methodology permalink pinned to a commit/tag** (see §5) + a confidence rating (§6).
- **Print:** a `@media print` stylesheet (hide nav/toggles, page header/footer with asset, event
  date, "generated <date>", method version) so *Print → Save as PDF* yields a clean dossier
  suitable for submission to the EA/Ofwat or a councillor.

This makes each flag independently auditable — the difference between "a campaigner's claim" and
"a reproducible evidence pack."

---

## 5. Public, versioned methodology link

- `DRY-SPILL-METHOD.md` already exists and is linked. Strengthen it for citation now the repo is
  open-source (AGPL, F5):
  - Link from each dossier to the method **pinned to a tag/commit** (e.g.
    `…/blob/v1.0.0/DRY-SPILL-METHOD.md`), and show the version inline: *"Methodology v1.0.0"*. A
    dossier must reference the exact method version it was generated under, so it stays reproducible
    even if defaults later change.
  - Optionally render it via **GitHub Pages** for a friendlier public URL, but the pinned repo file
    is the citable source of truth.
  - The method doc should carry a short **changelog** and a DOI-style stable heading per version.
- Store the method version + the parameters used (threshold, window, min-duration) **with each
  classification/dossier** so the evidence is self-describing.

---

## 6. Other robustness / evidence-base improvements

- **Confidence rating per dry spill** — combine: duration (longer = stronger), widest antecedent
  dry window passed (4-day > 1-day), gauge distance (closer = stronger), gauge reporting ≥90%, and
  low river flow. Surface **High / Medium / Low** so the team can lead with the most defensible
  cases. Cheap to compute from data we already have.
- **Gauge representativeness** — implement the `DRY-SPILL-METHOD.md` §4 recommendation: per-asset
  nearest *in-catchment* gauge (not one gauge for the whole river), load more EA rain gauges, and
  on the dossier flag when the gauge is far (> ~10 km) or in a different sub-catchment / much
  different elevation (Dartmoor vs estuary).
- **Multi-gauge corroboration** — if 2+ nearby gauges are all dry, say so; a single-gauge dry day
  is weaker.
- **Exclude low-quality data** — don't assert "dry" when the monitor's annual **% operational < 90%**
  or there's a data gap spanning the event; mark "insufficient monitoring" instead of dry. (We now
  hold `edm_operation_percent` from the EA FeatureServer — use it.)
- **Tidal/coastal caveat** — auto-flag coastal CSOs where short spills near high tide may be
  artefacts; pair with a tide-time layer (already on the backlog) for those sites.
- **Immutable evidence snapshot** — when a dossier is generated/exported, snapshot the exact
  rainfall/flow readings + parameters used (don't rely on live re-query), so a PDF submitted today
  can be reproduced months later even if upstream data is revised.
- **Permit context** — show the asset's permit reference and, where known, the Formula-A FFT/PFF
  pass-forward setting, with the honest caveat that we test the **rainfall limb only** (we don't
  hold pass-forward telemetry). Sets accurate expectations about what the flag does/doesn't prove.
- **"Repeat offender" view** — assets with multiple dry spills across years (persistent
  groundwater ingress / fault signature, per Hammond et al.) — the strongest systemic cases.
- **Export** — a one-click CSV/PDF of an asset's (or area's) dry spills with the evidence columns,
  for bulk submission or FOI/EIR follow-up.

---

## Suggested phasing

| Phase | Scope | Effort |
|---|---|---|
| **A** | `formatDuration` util everywhere; `min_duration_minutes` param + default-on toggle (with hidden-count line); method-version pin | small |
| **B** | `spill_event_evidence` RPC + the dossier page (map, rainfall chart, multi-window, print CSS) | medium |
| **C** | Confidence rating; %-operational data-quality gate; per-asset nearest-gauge + more gauges | medium |
| **D** | Immutable evidence snapshot + PDF export; tide caveat; repeat-offender view | larger |

A delivers the three quick UX wins (threshold, filter, duration format). B is the headline
"evidence dossier." C/D harden it. None changes the EA-canonical counts.

---

Sources:
- [Storm Overflow Assessment Framework 2025 — GOV.UK](https://www.gov.uk/government/publications/storm-overflow-assessment-framework-2025/storm-overflow-assessment-framework-2025)
- [What is Storm Overflow EDM Data? — Open Innovations (12/24 method)](https://open-innovations.org/blog/2021-07-06-what-is-storm-overflow-edm-data-)
- [South West Water — high-frequency (2-min/10-sec) monitoring & short spills](https://smartwatermagazine.com/news/south-west-water/real-time-monitoring-network-driving-faster-action-storm-overflows)
- [Severn Trent EDM Report — 12/24 counting & no permit duration requirement](https://www.stwater.co.uk/get-river-positive/event-duration-monitor-edm-report-7/)
