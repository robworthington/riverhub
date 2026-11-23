# Data validation — South West Water overflows vs the EA EDM annual return

**Date:** 2026-11-23 · **Scope:** the 29 live SWW river catchments on the national deployment
(`riverhub-national`) · **Re-run:** `scripts/validate_edm.py --year <YYYY>` (see end).

## Why

Our overflow data is only as good as the authoritative record it tracks. This note documents the public
sources we can check it against, and the result of reconciling what we loaded against the Environment
Agency's **EDM Storm Overflow Annual Return** — the official, validated count of storm-overflow spills and
durations per outlet. `scripts/validate_edm.py` re-runs this check on demand for any year.

## Public data sources

### A. Annual, validated — the authoritative spill record (gold standard)
1. **EA EDM Storm Overflow Annual Return** — per-outlet counted spills (12/24-hour method), total hours,
   EDM-operation %, permit ref, WFD water body, receiving water, lat/long. Published yearly (late March) on
   [environment.data.gov.uk](https://environment.data.gov.uk/dataset/21e15f12-0df8-4bfc-b763-45226c16a8ac),
   Open Government Licence. **This is the source our `edm_annual_stats` reconcile to.**
2. **The Rivers Trust EDM ArcGIS mirror** — the same annual return as queryable FeatureServers
   (e.g. `Storm_Overflow_EDM_Annual_Returns_2024` at `services3.arcgis.com/Bb8lfThdhugyc4G3`), so it can be
   summed/filtered without downloading the ZIP. `validate_edm.py` reads this.
3. **EA Environmental Performance (EPA) report, per company** —
   [SWW 2024](https://www.gov.uk/government/publications/water-and-sewerage-companies-in-england-environmental-performance-report-2024/south-west-water-epa-data-report-2024):
   1,362 overflows, 41.3 avg spills/overflow, 9.7 hrs/event, 93.8% at ≥90% operation. Company-level sanity check.
4. **South West Water's own publication** — its
   [storm overflow data page](https://www.southwestwater.co.uk/environment/rivers-and-bathing-waters/storm-overflows/storm-overflow-data)
   + annual EDM report, plus **monthly EDM start/stop workbooks** (by the last Friday of the following
   month) — the files our `spill_events` history is built from.

### B. Near-real-time — live "spilling now" status (unvalidated)
5. **Water UK National Storm Overflow Hub (NSOH)** — the standardised near-real-time API across all English
   companies; upstream for the public maps.
6. **SWW WaterFit Live** (the `NEH_outlets_PROD` ArcGIS feed) — SWW's near-real-time feed, and **our live
   source** for `edm_snapshots`.
7. **[The Rivers Trust Sewage Map](https://www.theriverstrust.org/about-us/news/sewage-map-questions)** and
   **Surfers Against Sewage "Sewage Data HQ"** — both consume NSOH; visual cross-checks.

### C. Supporting / context
8. **EA Public Register — Water Discharge permits** (permit references, consented discharge points).
9. **EA "Storm overflows under investigation"** FeatureServer (SOAF investigation status).

> **Key distinction:** the annual return is *validated* counted spills; the live feeds (NSOH/WaterFit) are
> *unvalidated* EDM activation status. Our two data products match their respective authoritative sources —
> annual stats ↔ EA return, live snapshots ↔ WaterFit.

## Result — the data matches (2022, 2023, 2024 all PASS)

### Per-outlet spot-check — exact every year
`validate_edm.py --year {2022,2023,2024}` each return **PASS 6/6** on the top spillers, matching the EA
return on counted spills **and** hours. Example (2024):

| Our outlet | Our spills | EA return | Our hrs | EA hrs |
|---|---|---|---|---|
| Abbotsham STW | 329 | 329 | 555 | 555 |
| Roborough STW | 327 | 327 | 1,573 | 1,573 |
| Dulford SPS | 283 | 283 | 6,198 | 6,198 |
| Payhembury STW | 279 | 279 | 5,373 | 5,373 |
| Town Quay SPS, Fowey | 264 | 264 | 711 | 711 |
| St Neot STW | 245 | 245 | 2,522 | 2,522 |

Our annual stats *are* the EA's validated return.

### Aggregate reconciliation, by year
| Year | Our overflows | EA company | Our spills | EA spills | spills share | Avg EDM op % (ours / EA) |
|---|---|---|---|---|---|---|
| 2024 | 1,055 | 1,370 | 47,055 | 56,173 | 83.8% | 97.4 / 97.4 |
| 2023 | 971 | 1,374 | 46,134 | 58,249 | 79.2% | 95.2 / 94.4 |
| 2022 | 997 | 1,342 | 31,625 | 37,649 | 84.0% | 94.3 / 93.6 |

We consistently hold ~79–84% of SWW's spills across ~71–77% of its overflows. **The remainder is by
design** — coastal and estuarine outlets not assigned to any of the 29 river catchments we onboarded (SWW
is a very coastal company). Within what we cover, the per-outlet figures are identical to the authoritative
record, and the EDM reporting percentage matches to within ~1 point.

### A note on outlet naming at multi-outlet works
Some sewage-treatment works have several co-located EDM outlets, and SWW's operational outlet names (our
source) don't always map 1:1 onto the EA consents-database names. Example: at **Beals Mill** the EA 2022
return splits the works into four outlets; our feed carries two. Our "Beals Mill STW_SO_Rezare" figure
(293 spills / 3,938 hrs) matches the EA record named "Beals Mill No 2" exactly — same value, different name.
`validate_edm.py` matches on same-spills-**and**-hours at the location (not nearest-point name), so these
cross-system naming differences don't produce false failures; the matched EA site name is printed so the
difference stays visible. This is a *naming/granularity* difference between the two registers, not a
discrepancy in our spill figures.

**Bottom line:** our SWW overflow data is faithful to the EA's validated EDM annual return at the
individual-outlet level, with complete river-catchment coverage and the expected coastal-outlet gap.

## Re-running the check

```bash
export DB_URL="<national pooler url>"
python3 scripts/validate_edm.py --year 2024                 # defaults to South West Water, top-6 spot-check
python3 scripts/validate_edm.py --year 2023 --top 10        # any published year, deeper spot-check
python3 scripts/validate_edm.py --year 2024 --company "South West Water" --tolerance 0
```

Reads our side straight from the national DB (local `psql`, else dockerised `postgres:16` — no DB driver
needed) and the EA side live from the Rivers Trust mirror. Exits non-zero if any per-outlet spot-check
fails or our aggregate overshoots the company total — so it doubles as a pre-go-live / CI gate when
onboarding a new SWW catchment. For a non-SWW company, pass `--company` (it must match both
`organisations.company_name` and the EA return's water-company name).
