# River Hub: adding Welsh rivers

*Plan, 27 Nov 2026. Follows `ENGLAND-ROLLOUT-PLAN.md` (England phases 0–3 done: 89 rivers live) and
`UK-PLATFORM-SPEC.md` §1, which left "seams" for the devolved nations and said Wales comes first.
The per-river runbook stays `NATIONAL-ONBOARDING.md`. Data sources were checked on 27 Nov 2026; every
URL below answered that day unless marked otherwise.*

## 1. Summary

Wales is mostly a new set of data adapters, not new pages. The pages, the database model and the
onboarding pipeline carry over. Four things are different:

1. **A different regulator.** Natural Resources Wales (NRW), not the Environment Agency, publishes
   the water-quality, telemetry, incident, protected-area and improvement-programme data. Nearly all
   of it is open (OGL v3), and most of it comes from one service, the DataMapWales WFS.
2. **A different live feed.** Dŵr Cymru Welsh Water (DCWW) has a public live storm overflow feed
   with about 2,360 outlets, but it isn't in the national NSOH format and **states no licence**.
   Hafren Dyfrdwy (upper Dee and parts of the Severn in Wales) has no public feed that we could find.
3. **No event-level spill history.** England has the EA's start/stop files. Wales has none, so dry
   spills and the per-event record would have to be built up from our own hourly polling, starting
   from the day we connect.
4. **Two languages.** There's no legal duty for a volunteer site, but the sources carry Welsh names
   (`_cy` fields) for free, so we should show Welsh river and place names from the start.

**Recommendation:** fix the licence question with DCWW first (it decides whether we can show live
status at all), build the Welsh adapters, pilot one wholly-Welsh river, then load Western Wales.
Do the cross-border Dee and Severn catchments together with England Phase 5 (Severn Trent), since
those catchments need both countries' data. Move the import runs off Rob's Mac onto GitHub Actions
before the Welsh batch (section 7).

## 2. Scale

From NRW's WFD Cycle 3 layers:

| River basin district | Operational catchments | River water bodies | Notes |
|---|---|---|---|
| Western Wales | ~90 | 426 | wholly Welsh |
| Severn (Welsh part) | ~34 | 230 | cross-border; Wye, Usk, upper Severn, Teme |
| Dee | 9 | 61 | cross-border |
| **Total** | **~133** | **717** | |

Grouped into River Hub pages the way England was (a page per main river, small coastal streams
grouped), that is roughly **30–40 Welsh pages**, about 17 of them from Western Wales's nine
management catchments. DCWW's annual return lists about 2,350 overflows, so Wales would add roughly
60% to today's 4,063.

## 3. Data sources: England → Wales

| What | England (now) | Wales | Licence | Ready? |
|---|---|---|---|---|
| Live overflow status | Company NSOH ArcGIS feeds | **DCWW** `services3.arcgis.com/KLNF7YxtENPLYVey/arcgis/rest/services/Spill_Prod__External/FeatureServer/0`: `DCWW_ID`, `permit_number`, text `status`, ISO start/stop, `Receiving_Water`, `*_Welsh` fields. **Hafren Dyfrdwy:** none found (not in Severn Trent's NSOH feed) | DCWW: **none stated** | Needs licence; new reader |
| Annual returns (spills, hours) | EA all-years ArcGIS layer | Rivers Trust `Event_Duration_Monitoring_Storm_Overflows_2025` (DCWW + HD, same schema as England, has `country` and `permitReferenceEA`); DCWW's own `EDM_2022`–`EDM_2025` layers | OGL (Rivers Trust) | Yes |
| Event start/stop history | EA start/stop zips | **None.** Build from our hourly snapshots | – | Build it |
| Water quality | EA Water Quality Archive API | NRW Open Water Quality Archive: stations on DataMapWales (`geonode:nrw_water_quality_archive_stations`, 9,842), results as monthly CSVs on NRW's ShareFile | OGL v3 | Bulk files only |
| River levels, flow, rain | EA flood-monitoring API | NRW telemetry API `api.naturalresources.wales/telemetry/api/` (stations, measures, readings; no key) | OGL | Yes |
| Water bodies, catchments, districts | EA WFD Cycle 2 | DataMapWales WFS `datamap.gov.wales/geoserver/ows`: `nrw_wfd_river_waterbodies_c3…`, `nrw_wfd_operational_catchments_c3`, `nrw_wfd_management_catchments_c3`, `nrw_wfd_river_basin_districts_c3`. Same `GB…` water body ids | OGL | Yes |
| Council areas | ONS parishes | Community and town councils (`geonode:community_and_town_councils`, 878, `W04…` codes, Welsh and English names) | OGL | Yes |
| SSSI, SAC, SPA, Ramsar | Natural England | NRW (`inspire-nrw:NRW_SSSI`, `NRW_SAC`, `NRW_SPA`, `NRW_RAMSAR`) | OGL | Yes |
| Bathing and shellfish waters | EA | NRW (`geonode:nrw_bathing_waters` 112, `geonode:shellfish_waters_protected_area` 16) | OGL | Yes |
| Pollution incidents | EA NIRS | NRW Environmental Pollution Incidents (Excel on ShareFile, quarterly, from 2016; category coverage unclear) | OGL | Bulk file only |
| Improvement programme | EA WINEP | NRW National Environment Plan, NEP (`geonode:nrw_national_environment_plan`, 3,126 actions, PR24; `W_…` driver codes; the completion date field is spelt `compleation_date`) | OGL | Yes |
| Works catchments (systems, population) | Wastewater catchment areas release (WWCA) | WWCA is GB-wide, so check it covers DCWW at works level. DCWW's own layer has only 106 large drainage catchments | Open | Check |

Attribution for NRW data: "Contains Natural Resources Wales information © Natural Resources Wales and
Database Right. All rights Reserved." plus the OS licence line.

## 4. Platform changes (phase W0)

1. **Nation per river.** Add `organisations.nation` (`england` / `wales`) and use it to pick
   regulator wording. "Environment Agency" is written into 37 files and "England" into 16. Replace
   them with a small helper (`regulatorFor(river)`, `nationName`) so a Welsh page says NRW, NEP and
   "community council".
2. **National framing.** Home page, share cards and titles say "England's rivers". These become
   "England and Wales". The home page keeps one map with both nations, and Wales gets its own
   summary block.
3. **Districts.** Western Wales gets its real outline from NRW. Dee and Severn are already in the
   district table from EA data, but only their English parts; merge in NRW's Welsh part.
4. **Welsh names.** Add `river_name_cy` (and Welsh names on sites, communities and bathing waters,
   where the source has them). Show both, Welsh first on Welsh pages if Rob prefers; no full
   translation of the site in this plan.
5. **ID crosswalk.** DCWW live ids (`DCWW1001`) ↔ permit number ↔ annual-return `permitReferenceEA`.
   Store the DCWW id as `asset_unique_id` and keep the permit for matching.
6. **Counting rules.** The EA 12/24-hour counting and the 2020 baseline are English rules. DCWW's
   annual returns carry counted spills, so the "counted" figures carry over; label the baseline and
   targets as England-only where Welsh targets differ.

## 5. Adapters to build (phase W2)

Each one is a new `import_*.py` step selected by the config's nation, so `setup_catchment.py` and
`run_batch.py` stay as they are.

| Step | New for Wales |
|---|---|
| `boundary`, `water-bodies`, `parishes` | WFS readers for NRW Cycle 3 catchments, water bodies and communities |
| `assets` | DCWW feed reader (text status, ISO dates) into the same `sewage_assets` rows |
| `edm` | Rivers Trust annual-return reader filtered to `country = Wales` |
| `spill_events` | Skipped at first; then derived from our own snapshots (see below) |
| `winep` | NEP reader into `winep_actions` with a `programme = 'NEP'` marker |
| `ea-wq`, `ea-wq-samples` | NRW archive: stations from the WFS, results from the monthly CSVs (since 2021, outline-only) |
| `pa-*` | NRW designated sites, bathing and shellfish waters |
| `gauges`, `ea-backfill` | NRW telemetry API |
| live sync (`edm-sync` cron) | DCWW feed in the hourly fleet sync |
| incidents | NRW incidents Excel into `pollution_incidents` |

**Spill history from snapshots.** The hourly sync already stores every status change
(`prune_edm_snapshots` keeps them). A small job turns each start/stop pair into a `spill_events` row
marked `source = 'snapshot'`. That gives Welsh rivers a growing event record and, after a few months,
dry-spill analysis. Pages must say plainly that Welsh history starts on the date we connected.

## 6. Order of work

| Phase | What | Rough effort |
|---|---|---|
| W1 | Ask DCWW for CC BY 4.0 terms and a stable endpoint for the live feed (and whether they'll publish start/stop history); ask Hafren Dyfrdwy whether a feed exists. Tell NRW we're using their data. Can run alongside W0/W2 | Rob: 2 emails; replies may take weeks |
| W0 | Platform seams (section 4) | 1 week |
| W2 | Adapters (section 5), each tested on one river | 1–2 weeks |
| W3 | Pilot: **River Teifi** (wholly Welsh, DCWW only, mid-sized, well-known locally). Check against DCWW's annual return | 2–3 days |
| W4 | Western Wales batch, about 17 pages, live after Rob approves the names | 1 week |
| W5 | Dee and Severn in Wales, together with England Phase 5 (Severn Trent), as two-company catchments | with Phase 5 |

If DCWW won't license the live feed, Welsh pages can still go live with annual returns, water quality,
improvement plans and incidents, and with live status shown as "not available for Welsh rivers".

## 7. Running imports from a server

Today every load runs on Rob's Mac: Rob types the database password into a terminal, `caffeinate`
keeps the Mac awake, and a big load (the Thames: 3 hours) is lost if the laptop sleeps or changes
network. What ties the pipeline to the Mac is small: Python with two packages (`openpyxl`,
`pyshp`), `psql`, and about 90 MB of downloaded inputs (EA start/stop zips 78 MB, the census cache
9 MB, the WWCA release and the WINEP spreadsheet).

| Option | Good | Limits |
|---|---|---|
| Rob's Mac (now) | Nothing to set up | Sleep, network changes, Rob has to be there |
| **GitHub Actions** | The repo is public, so runner minutes are free and uncapped; per-river logs; the password is a repo secret Rob adds himself; runs from a button on GitHub | 6-hour limit per job (fine per river, the Thames took 3 h); public repo means public logs (scripts print counts, secrets are masked) |
| **Self-hosted runner on the Hostinger VPS** (already runs the FoD site under Coolify) | No time limit; always on; same workflow file as above; can run scheduled refreshes | Shares the box with the FoD site (loads mostly wait on the network, so CPU is light); Rob keeps it patched |
| Vercel / Supabase functions | Already used for hourly jobs | 60-second limits; no good for loads |

**Recommendation:** one GitHub Actions workflow, `load-rivers.yml`, started by hand with inputs
(sheet or river slugs, steps to rerun, parallel jobs). It installs the two packages and psql,
downloads the input files from a public Supabase Storage bucket (all of them are open data), runs
`run_batch.py`, and uploads the logs and results CSV. A concurrency group stops two loads running at
once. Start on GitHub's runners; register the VPS as a self-hosted runner as well, for jobs over six
hours and for scheduled refreshes that nobody runs today: quarterly water-quality samples, the yearly
annual returns, and the NRW incident and water-quality files once Wales is in.

Before this works: Rob adds `DB_URL` as a repository secret (I never see it), and the scripts that
default to `~/Downloads` paths read their inputs from environment variables (most already do).

## 8. Database size and cost

Wales adds about 2,400 overflows and a large water-quality archive (9,842 stations since 2000). Loading
results only since 2021 and only for points inside each river's outline keeps it near the English
per-river size. Do the EA-sample de-duplication (to-do list) before this, so shared points are stored
once. Expect the database to pass 20 GB with Wales and Phase 5 together, which is still a few
dollars of disk; compute should move to Medium ($60/month) during these phases, or temporarily to
Large for the big loads (about $0.15/hour).

## 9. Decisions for Rob

1. Send the DCWW licence request now (W1), or wait until the adapters exist?
2. Welsh names: show both everywhere, or Welsh first on Welsh pages?
3. Pilot river: the Teifi, or another (Tywi, Usk, Taff)?
4. Server: GitHub Actions only, or also the VPS runner from the start?
5. Do Western Wales before England Phase 4 (Anglian), or after?
