# Grouping sewage assets into systems — a defensible methodology

*Research, 15 June 2026. How to revise the way River Hub groups storm overflows, pumping stations
and treatment works into "sewage systems" so the grouping reflects the real collecting network —
e.g. Dartington's overflows drain to **Totnes STW**, so they belong to the Totnes wastewater system,
not a separate "Dartington system".*

## 1. The problem with the current grouping

`sewage_systems` is currently built by **asset-name prefix** — every works/town name becomes its own
system ("RATTERY system", "DARTINGTON system", "TOTNES system"). That is convenient but **not
defensible**: it asserts a treatment relationship from a string, and it is wrong wherever sewage is
conveyed between settlements. Dartington has no treatment works of its own — its foul flow is pumped
to **Totnes STW** — yet River Hub shows a standalone "Dartington system". This distorts:

- **capacity-vs-demand** (population is attributed to a phantom works);
- **per-works spill and permit roll-ups** (Dartington's CSOs should sit under Totnes's FFT/DWF);
- **WINEP and advocacy narratives** ("which works must fix what") and the permit evidence we just
  loaded.

## 2. What a defensible grouping needs

Each asset assigned to the **terminal wastewater treatment works (WwTW) that ultimately treats its
flow**, on the basis of an **authoritative, documented, reproducible source** — not a name, and not
our own judgement. The "system" becomes that WwTW (its collecting catchment), and every overflow,
pumping station and storm tank in that catchment groups under it.

## 3. Sources evaluated

| Option | What it is | Defensible? |
|---|---|---|
| **A. Name prefix** (current) | group by the town in the asset name | ✗ No basis; demonstrably wrong (Dartington) |
| **B. EDM permit / supplementary-permit ref** | group outlets sharing a permit | ✗ **Tested & rejected** — each Dart outlet self-permits; `wasc_supplementary_permit_ref` just echoes the outlet's own permit, so it never links a CSO to its works |
| **C. UWWTD/UWWTR agglomeration boundaries** (EA/EEA) | statutory "collecting system" polygons | ◐ Authoritative but **only ≥2,000 p.e.** agglomerations (misses small rural works) and EU-era vintage |
| **D. GB wastewater catchment areas** (Hoffmann et al.) | water companies' own catchment areas (via EIR), consolidated + matched to UWWTD works | ✓ **Recommended** — see below |
| **E. SWW DWMP wastewater catchments** | SWW's own ~653 WwTW catchments | ✓✓ Authoritative, but **PDF-only** (not open GIS); obtain the layer by EIR for ground-truth/override |
| **F. SWW sewer-network connectivity** (GIS) | the actual pipe topology | ✓✓✓ Most accurate; not open — EIR; use to resolve disputed edges |

## 4. Recommended method — point-in-polygon to the wastewater catchment areas

**Dataset:** *Wastewater catchment areas in Great Britain* (T. Hoffmann et al.) —
`github.com/tillahoffmann/wastewater-catchment-areas` (releases ship `catchments_consolidated.*`
shapefile + `waterbase_catchment_lookup.csv`).

Why it is the most defensible open source:

- **It is the water companies' own data**, not a model: the catchment polygons were obtained
  **directly from the 10 GB sewerage undertakers (incl. South West Water) via Environmental
  Information Regulations requests** — i.e. the same service-area boundaries SWW uses internally and
  in its DWMP. The grouping therefore reflects *which properties actually drain to which works*.
- **Matched to the statutory works register**: each catchment carries a UWWTD treatment-works id
  (`uwwCode`) and name (`uwwName`), so "system = terminal WwTW" is anchored to a national identifier,
  not a free-text town.
- **Peer-reviewed and citable** (DOI 10.1002/essoar.10510612.2), **MIT-licensed**, **British National
  Grid**, **8,185 catchments covering >99% of the population** — so it includes the small rural Dart
  works (Rattery, Holne, Staverton…), not just large agglomerations.

**The method:**
1. Load `catchments_consolidated` polygons (reproject BNG→WGS84) into PostGIS, with `uwwCode` /
   `uwwName` / `company`.
2. For each `sewage_asset` (we hold lat/lng), **spatial point-in-polygon**: the catchment it falls
   in → its `uwwName` is the terminal works → that becomes the asset's system.
3. Rebuild `sewage_systems` as **one row per terminal WwTW** in the catchment; repoint every asset's
   `sewage_system_id`. Store, per assignment: the source (`wwca-eir`), the `uwwCode`, and a
   **confidence** (inside-polygon = high; nearest-within-N-m fallback = medium).
4. **Fallbacks & overrides:** assets outside every polygon (the <1%) keep a nearest-works assignment
   flagged *low confidence*; a nullable `system_override` lets a volunteer pin an asset to the
   correct works where local/EIR knowledge beats the polygon (audit-logged). Disputed network edges
   resolved against SWW DWMP (E) / network data (F) obtained by EIR.

This is the same "national connector + per-catchment clip" pattern the rest of River Hub uses, so it
generalises to every instance (Teign, and future catchments) with no hand-grouping.

## 5. Why this is defensible (the argument to make)

- **Provenance:** the boundaries are *South West Water's own wastewater catchment areas*, released
  under EIR and published in a peer-reviewed dataset — we can cite exactly where each grouping comes
  from, rather than "we matched on the name".
- **Reproducibility:** anyone can re-run the point-in-polygon against the open dataset and get the
  same systems; the method, source version and per-asset confidence are recorded.
- **Conservative & correctable:** high/medium/low confidence is stored, low-confidence and
  outside-polygon cases are flagged not hidden, and a documented override path exists for the rare
  ambiguous edge — so the grouping is auditable and improves as better data (DWMP/network) arrives.
- **Anchored to the statutory register** (UWWTD `uwwCode`), the same identifier the EA/WINEP/permit
  regimes use — so the systems line up with the permits and WINEP actions we already hold.

## 6. Implementation plan (when approved)

1. Add a `scripts/import_sewage_systems.py` connector: download the WWCA release, clip to the
   catchment bbox/company, load polygons to a `wastewater_catchments` table (PostGIS), spatial-join
   to `sewage_assets`, and rebuild/repoint `sewage_systems` (terminal works) — config-driven,
   idempotent, added to `setup_catchment.py`.
2. Migration: `sewage_systems` gains `uww_code`, `catchment` geometry, `source`; `sewage_assets`
   gains `system_match_confidence` + `system_override` (nullable, admin-set).
3. Keep the works name as a label; the **identity** is the `uwwCode`.

## 7. Acceptance test (the Dartington case)

The revision is accepted when the assets the name method mis-grouped resolve to their true works —
verifiably, the **Dartington overflows (Dartington C, Dartington Sch Two, Textile Mill, Shinners
Bridge) and the Totnes-town CSOs/SPS all group under Totnes WwTW**, while genuinely standalone rural
works (Rattery, Holne) remain their own system. Report every reassignment for review and spot-check a
sample against the SWW DWMP Kingsbridge–South Devon / Teign plans.

## 8. Built & validated (15 Jun 2026)

Implemented and run on the Dart (local): migration `0035_wastewater_catchments.sql` +
`scripts/import_sewage_systems.py` (config-driven, added to `setup_catchment.py` as the `systems`
step, before population). It loads the 673 South West Water catchment polygons (BNG→WGS84 via
PostGIS), spatial-joins assets, and rebuilds `sewage_systems` as one row per terminal works.

Result on the 45 Dart assets: **39 high-confidence** (inside a catchment polygon), **6 medium**
(works discharge point just outside its polygon → nearest catchment ≤ 3 km), **0 low**. The
acceptance test passes — the four **Dartington** overflows (Dartington C, Dartington Sch Two,
Shinners Bridge, Textile Mill) now group under **Totnes STW**; **Dartmouth STW** gathers 7 (the
Kingswear/Dartmouth pumping stations), **Buckfastleigh STW** 7. Standalone rural works (Rattery,
Holne, Scorriton…) remain their own system. Stoke Gabriel SPS resolves to the Torbay works — a real
cross-estuary transfer the name method missed.

> **Re-run population after regrouping.** `system_assumptions` (ONS-derived demand) is keyed to the
> old systems; the orchestrator runs `estimate_system_population.py` *after* the `systems` step so a
> fresh setup is correct, and for an existing instance the population importer must be re-run once
> after the regroup. Hand-entered overrides on a retired system should be moved with `system_override`.

## 9. Caveats

- **Vintage:** the WWCA EIR submissions are point-in-time; very recent network changes may lag.
  Re-pull on dataset updates; allow overrides.
- **Edge-of-network ambiguity & pumped transfers:** a polygon boundary can split a road; the
  nearest-polygon fallback + override handles these. WWCA's own data-quality notes (e.g. duplicate
  works names) are carried forward — dedupe on `uwwCode`.
- **Small/private works:** assets on private (non-water-company) systems may sit outside all
  polygons — flag as low confidence rather than forcing a match.

## Sources
- [Wastewater catchment areas in GB — dataset + code (MIT)](https://github.com/tillahoffmann/wastewater-catchment-areas) · releases: `…/releases`
- Hoffmann et al., associated publication — DOI [10.1002/essoar.10510612.2](https://doi.org/10.1002/essoar.10510612.2)
- [UWWTD Treatment Plants (England) — data.gov.uk](https://www.data.gov.uk/dataset/0f76a1c3-1368-476b-a4df-7ef32bfd9a8b/urban-waste-water-treatment-directive-treatment-plants)
- [SWW Drainage & Wastewater Management Plan (DWMP)](https://www.southwestwater.co.uk/about-us/what-we-do/engineering-projects/wastewater/drainage-and-wastewater-management-plan) — ~653 WwTW catchments; Teign & Kingsbridge–South Devon strategic-catchment plans
- EDM annual-return fields checked (no parent-works field; permit/supplementary-permit do not group outlets) — EA EDM all-years FeatureServer
