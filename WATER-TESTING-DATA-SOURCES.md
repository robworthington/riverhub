# Water-testing data sources — research & licensing assessment

*Research, 15 June 2026. Public sources of water-quality / water-testing data that River Hub could
ingest to complement the Friends of the Dart citizen sampling and fill the Teign's greenfield gap.
Each source assessed for what it provides, how to access it, and its licence. Endpoints verified
live against the Dart/Teign area where noted.*

## What River Hub already uses
EA EDM spills, EA Hydrology (rainfall/flow), ONS boundaries/Census, EA WFD water-bodies & RNAGs
(Catchment Data Explorer), OSM rivers, WINEP. **None of these is laboratory water-*testing* data** —
that gap is currently filled only by FoD's own citizen sampling (and Teign has none). The sources
below are the testing/monitoring datasets.

## Tier 1 — Environment Agency statutory monitoring (all Open Government Licence v3)

### 1. EA Water Quality Archive (WIMS) — the primary source ⭐
The EA's main laboratory water-testing dataset: samples taken at monitoring points and analysed for
chemistry, nutrients and bacteria. **~58,000 sampling points, 3.9 M samples, 54 M measurements since
2000** (determinands include E. coli, ammonia, phosphate, nitrate, BOD, dissolved oxygen, metals…).
- **Access:** bulk CSV by area/year + a linked-data API at `environment.data.gov.uk/water-quality`
  (sampling-point resource id e.g. `…/id/sampling-point/SW-70649999`). **Easiest for us:** the
  **CaBA / Rivers Trust ArcGIS mirror** — same host as our WINEP layer:
  - *EA Water Quality Sampling Sites (WIMS)* FeatureServer — **verified: 389 sites in the Dart/Teign
    bbox**, with `notation`, lat/long, WFD RBD, CaBA catchment.
  - *EA WQA summary statistics* FeatureServer (CaSTCo) — **verified: 920 rows in-bbox**, per site ×
    **determinand**, with per-year (2022–24) count/min/max/mean + latest sample/result + water body.
- **Licence:** **OGL v3** (free reuse incl. commercial, attribution "Environment Agency").
- **Fit:** strongest immediate win — a national connector exactly like EDM/WINEP, giving real EA
  E. coli / nutrient / DO context at ~hundreds of sites per catchment **with zero volunteer effort**,
  and instant Teign coverage. The summary-stats layer is ready-aggregated for charts/maps.

### 2. EA Ecology & Fish Data Explorer
Biology underpinning WFD ecological status: **macroinvertebrate** surveys (the metric Riverfly
approximates), **diatoms**, **macrophytes**, and **fish** (NFPD). Directly relevant to the Fish /
macrophyte RNAGs in the PoM work.
- **Access:** Data Explorer + API + bulk download at `environment.data.gov.uk/ecology/explorer`.
- **Licence:** **OGL v3**.

### 3. EA Bathing Water Quality
Designated bathing waters: in-season weekly samples (**E. coli + intestinal enterococci**) + annual
4-year classifications.
- **Access:** linked-data API at `environment.data.gov.uk/doc/bathing-water` — **verified live**
  (returns JSON). Per-site samples + classifications.
- **Licence:** **OGL v3**.
- **Fit:** authoritative comparator for our bathing-water classification work; covers designated
  sites only (Dart/Teign have aspiring, not yet designated, so coverage is thin locally — useful as
  the standard + for designation bids).

### 4. EA Catchment Data Explorer (already partly used)
WFD classifications + Reasons for Not Achieving Good per water body. OGL v3. We already pull the
water-body taxonomy; the classification time-series is additional.

## Tier 2 — other agencies

### 5. Cefas / FSA — Shellfish classification & microbiological monitoring
**E. coli in shellfish flesh** at Representative Monitoring Points + harvesting-area class A/B/C.
Directly relevant to the Dart & Teign **estuary shellfish waters** (a receptor in our WINEP/PoM work).
- **Access:** per-RMP CSV download from `cefas.co.uk` (shellfish classification & monitoring);
  classification zone maps; DEFRA MMO Aquaculture ArcGIS for area geometries.
- **Licence:** Cefas open data is generally **OGL**, but the shellfish classification programme is
  run for the **FSA** — **verify the per-dataset terms** before bulk reuse (published openly for
  viewing/CSV; attribution to Cefas/FSA). ⚠️ confirm, don't assume blanket OGL.

### 6. Cefas Shellfisheries / coastal water quality
Additional E. coli water sampling near shellfisheries; coastal/estuarine. OGL/Cefas terms as above.

## Tier 3 — citizen science (licensing varies — assess case by case ⚠️)

These are valuable for density and local buy-in, but **"open-access map" ≠ open licence for bulk
re-use** — data is often owned by the collecting group or platform. Engage via data-sharing terms.

### 7. FreshWater Watch (Earthwatch Europe)
Volunteer **nitrate / phosphate / turbidity** monitoring; >1,000 active members; open-access data map.
- **Licence:** **Earthwatch platform terms — NOT automatically OGL.** Map is viewable; bulk/programmatic
  reuse needs Earthwatch agreement + attribution. ⚠️

### 8. Riverfly / Anglers' Riverfly Monitoring Initiative (Riverfly Partnership / FBA)
Standardised **macroinvertebrate** abundance scores; national DB hosted by the **Freshwater
Biological Association**; groups upload to **Cartographer** (real-time national view).
- **Licence:** **varies / not blanket-open** — data owned by monitoring groups; Cartographer is a
  platform. Reuse needs Riverfly Partnership / group permission. ⚠️ Westcountry groups likely
  shareable locally.

### 9. Rivers Trust / CaBA Data Hub (`data.catchmentbasedapproach.org`)
Hosts the **EA-derived mirrors** (WIMS, WQA stats, WINEP — the ones we'd use; these inherit **OGL**)
plus partnership-contributed datasets (licence per layer). Attribute EA **and** Rivers Trust.

### 10. CaSTCo — Catchment Systems Thinking Cooperative
National programme standardising citizen + agency monitoring into shared, comparable open datasets
(owns the *EA WQA summary statistics* layer above). **Strategic** for River Hub's federation: the
emerging common data standard for catchment monitoring. Engage for alignment.

### 11. Westcountry Rivers Trust — Westcountry CSI (local to Dart/Teign)
Regional citizen-science chemistry/observations across the South West; shared via the CaBA hub.
- **Licence:** WRT / CaBA terms — **engage directly** (they're the local trust; likely a partner). ⚠️

### 12. The Rivers Trust "Big River Watch" / SAS Safer Seas & Rivers Service
App-based public observations (Big River Watch) and real-time sewage alerts (SAS — spills, not
testing). Context layers; platform terms apply. ⚠️

## Tier 4 — research / reference
- **UKCEH / EIDC** (`catalogue.ceh.ac.uk`) — research datasets, e.g. freshwater macroinvertebrate
  family abundances England 2002–2019. Licence usually **OGL or CEH open** (per-dataset). Good for
  baselines, not live monitoring.

## Licensing summary

| Source | Licence | Commercial / bulk reuse | Note |
|---|---|---|---|
| EA Water Quality Archive (WIMS) | **OGL v3** | ✅ yes | attribute Environment Agency |
| EA Ecology & Fish | **OGL v3** | ✅ yes | |
| EA Bathing Water | **OGL v3** | ✅ yes | |
| EA Catchment Data Explorer | **OGL v3** | ✅ yes | |
| Cefas/FSA Shellfish | OGL (likely) — **verify** | ⚠️ confirm | FSA programme; published openly |
| CaBA Hub EA mirrors | **OGL v3** (inherited) | ✅ yes | attribute EA + Rivers Trust |
| FreshWater Watch | Earthwatch terms | ❌ not without agreement | open to view, not bulk |
| Riverfly / Cartographer / FBA | group/platform terms | ❌ not without permission | local groups likely shareable |
| Westcountry CSI / CaBA partnership data | WRT/CaBA terms | ⚠️ engage | local partner |
| CaSTCo standardised data | open (emerging standard) | ✅ likely | strategic alignment |
| UKCEH / EIDC | OGL / CEH open (per-dataset) | ✅ usually | research baselines |

**Bottom line:** everything from the **EA (WQ Archive, Ecology & Fish, Bathing Water, Catchment
Data)** is **OGL v3 — clean to ingest and redistribute** under River Hub's open licence with EA
attribution. **Cefas/FSA shellfish** is almost certainly fine but warrants a per-dataset licence
check. **Citizen-science platforms are NOT automatically open** — partner/agree, don't scrape.

## Recommendation for River Hub
1. **Build `import_water_quality_ea.py`** against the **CaBA WQA summary-statistics ArcGIS layer**
   (OGL, queryable by bbox, same pattern as `import_winep.py`) → instant EA water-testing context
   (E. coli, ammonia, phosphate, nitrate, DO) at hundreds of sites per catchment, **including the
   Teign with zero volunteer effort** — the single highest-value addition. Store as a parallel,
   clearly-attributed "EA monitoring" source alongside FoD citizen results.
2. **Bathing Water API** (OGL, live) → designated-water classifications + the official comparator for
   our bathing-water work and designation bids.
3. **Cefas shellfish** (verify licence) → estuary shellfish E. coli for the Dart/Teign shellfish
   receptors already referenced in the PoM/WINEP work.
4. **Ecology & Fish** (OGL) → macroinvertebrate/fish to evidence the Fish/macrophyte RNAGs.
5. **Citizen sources** (FreshWater Watch, Riverfly, Westcountry CSI) → pursue via **CaBA/CaSTCo
   data-sharing**, not scraping; aligns with River Hub's own federation direction.

## Sources
- [EA Water Quality Archive](https://environment.data.gov.uk/water-quality/view/download) · [dataset record](https://environment.data.gov.uk/dataset/2499766e-b15a-4f85-a758-5702de693723) · CaBA mirror: `services3.arcgis.com/Bb8lfThdhugyc4G3/.../Environment_Agency_Water_Quality_Sampling_Sites_(WIMS)` + `…/WIMs_summary_statistics`
- [EA Ecology & Fish Data Explorer](https://environment.data.gov.uk/ecology/explorer/docs/)
- [EA Bathing Water Quality API](https://environment.data.gov.uk/bwq/)
- [Cefas shellfish classification & monitoring](https://www.cefas.co.uk/data-and-publications/shellfish-classification-and-microbiological-monitoring/)
- [Open Government Licence v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- [FreshWater Watch](https://earthwatch.org.uk/program/freshwater-watch-in-the-uk/) · [Riverfly Partnership](https://www.riverflies.org/) · [CaBA Data Hub](https://data.catchmentbasedapproach.org/)
