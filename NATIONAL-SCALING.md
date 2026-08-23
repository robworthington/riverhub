# River Hub — scaling beyond two Devon catchments

*Scoping note: what it would take to cover all of England, then Scotland, Wales and Northern
Ireland. Derived from a review of the federation docs, importers, `config/catchments/*.json`, and
the schema. This is a scoping/decision document, not an implementation plan.*

## Bottom line

Covering **all of England is mostly a data-and-scale problem, not an architecture rewrite** — the
analytical layers already come from England-wide EA/national datasets, and the platform is explicitly
built as a "federation" of config-driven catchment instances (workstreams F1–F7). There is one real
code gap (the live spill feed) plus one strategic decision (deployment model at national scale).

**Scotland, Wales and Northern Ireland are a different order of work.** Each has its own regulator,
utility and data platforms, and several things River Hub is built on — EDM Annual Returns, WINEP,
SODRP/SOAF, the EA bathing/nature layers — have no direct equivalent outside England. None of the
four devolved regimes appears anywhere in the current codebase.

---

## 1. What already scales to any English catchment (≈ no work)

The heavy analytical layers are national EA datasets filtered by water company + WFD ids + bounding
box — all driven by `config/catchments/<x>.json`, so adding an English catchment on South West Water
is a config change plus a data load (`PROVISIONING.md`: "~half a day, plus the catchment data load").

| Layer | Importer | Source & scope |
|---|---|---|
| EDM annual spill history | `scripts/import_edm.py` | EA all-years FeatureServer, filtered `water_company_name` — **England-wide** |
| WINEP (PR24 + PR19) | `scripts/import_winep.py` | National set, all 19 English companies; config pulls the instance's slice |
| WFD water bodies / catchments | `scripts/import_water_bodies.py` | EA WFD Cycle 2/3 FeatureServers — **England** |
| Water quality (WIMS) + samples | `scripts/import_water_quality_ea.py`, `import_ea_wq_samples.py` | EA WIMS / Water Quality Archive — **England** |
| Rainfall + flow | `scripts/import_rain_gauges.py`, `backfill_ea_history.py` | EA Hydrology — **England** |
| Protected areas | `import_bathing_waters.py`, `import_shellfish_pas.py`, `import_sssi.py`, `import_nature_sites.py`, `import_ogc_areas.py` | EA / Natural England — **England** |
| Parishes + population | `import_parishes.py`, `estimate_system_population.py` | ONS — **England & Wales** |
| Works grouping | `import_sewage_systems.py` | GB-wide wastewater-catchment-areas dataset — **all GB companies** |

`scripts/catchment_config.py`: "National service URLs (EA/ONS/OSM endpoints) stay in the scripts:
they are central connectors, identical for every catchment." The catchment JSON carries only what
varies (org, river, company, WFD ids, bbox, centre); branding is env-driven (`src/lib/instance.ts`).

---

## 2. Covering all of England — the real work

### 2.1 Live spill feed — the one genuine England code gap
`src/lib/edm/sync.ts` hardcodes the SWW `NEH_outlets_PROD` feed (`ARCGIS_URL`) and the cron
(`src/app/api/cron/edm-sync/route.ts`) runs that same URL for **every** org. The feed's schema
(`interface OutletAttrs`: `Id`, integer `status`, `statusStart`, `latestEventStart`…) is SWW-specific.
Each of the ~9 English sewerage companies publishes a *different* near-real-time feed. Two routes:

- **Preferred — use the national feed.** Point the cron at the EA / Water UK **National Storm
  Overflow Hub** (the national near-real-time map that aggregates all companies). One adapter instead
  of nine.
- **Fallback — per-company registry.** Build the stubbed **water-company registry (workstream F7,
  `PROVISIONING.md` §1)** plus a per-company field-mapping adapter (~9 adapters). The config field
  `company.edm_feed` already exists but the runtime ignores it — the cron must become registry-driven.

Everything else on the live path (branding, `NEXT_PUBLIC_COMPANY_NAME`, map centre) is already
parameterised. Historical EDM/assets/WINEP already generalise by `company.name`.

### 2.2 Deployment model — the strategic decision
Today: **one Supabase project + one Vercel project + one org per instance**, and the public portal is
hard-wired to a single org (`app_config` is a single-row table; `public_org()` in
`0030_public_org_config.sql`). England has 100+ meaningful catchments, which forces a choice:

- **Many instances (federation as designed).** Does not scale to hundreds by hand — needs automated
  provisioning (Supabase/Vercel APIs, a real registry, CI). Fits "one community group owns one
  catchment."
- **One national instance (multi-tenant).** The schema already carries `organisation_id` everywhere
  and the cron already loops all orgs — but this needs the public portal de-single-org'd, a national
  data load into one DB, and serious performance work (see 2.3). Fits a single "England" product.
- **Hybrid (regional instances)** — a middle path.

This decision gates most of the remaining work and should be made first.

### 2.3 Scale / performance
National volumes are large: ~5,600 storm overflows, ~24,000 WINEP actions
(`PRIORITY-SITES-METHOD.md`), and *millions* of `spill_events`. We already hit the PostgREST row cap
on a single asset (fixed by aggregating in SQL — `0048_classify_spills_yearly.sql`). At national
scale the per-event correlated-subquery classification, `spill_events`, and map queries need
aggregation / materialised views, indexing, and possibly partitioning.

### 2.4 Data-matching robustness
Within a single company we already saw outlet-id drift (`NRA-SW-*` → `SWW*` → `SBB*`), co-located
SO/SSO conflation, and activity-reference swaps (see `import_edm.py` matching logic and its comments).
Across 9 companies the id/naming schemes multiply — the permit / name / spatial matching needs
per-company hardening and QA.

### 2.5 Operational
Per-instance upgrades, migrations and redeploys (`PROVISIONING.md` §9) become the bottleneck across
many instances, and need automation regardless of the model chosen.

---

## 3. Scotland, Wales & Northern Ireland — additional work

None of these appear anywhere in the codebase. Each needs a **new regime adapter layer** — a new
regulator, utility and set of data platforms — and several core features have no equivalent to port.

| Nation | Regulator / utility | Reusable | Rebuild / drop | Effort |
|---|---|---|---|---|
| **Wales** | Natural Resources Wales / Dŵr Cymru + Hafren Dyfrdwy | Core schema; shared England & Wales layers (ONS census, some WFD, GB works-grouping) | Storm-overflow, WFD/RNAG and bathing/nature data from **NRW** not EA; **WINEP / SODRP do not apply** | Moderate — closest to England |
| **Scotland** | SEPA / Scottish Water (single utility) | Core schema; OSM rivers | SEPA WFD (different id scheme), SEPA hydrology, NRS census/boundaries; **no WINEP, no SODRP, no EA EDM Annual Return**; Scottish Water EDM monitoring is recent/sparse, so dry-spill history is thin | Large — near ground-up data backend |
| **Northern Ireland** | NIEA / DAERA (Rivers Agency) / NI Water | Core schema | Separate everything (NISRA census, NI open data); **least open data** of the four nations | Large, and data-availability-limited |

### The data model is portable; the semantics are not
Generic and reusable: `sewage_assets`, `spill_events`, `test_results`, `water_bodies`,
`protected_areas`. Baked to the EA/England regime:

- **WFD water-body ids** `GB108046…` / `GB5108…` (EA hydrometric-area scheme) —
  `config/catchments/*.json` `wfd.wb_ids`, `import_water_bodies.py`.
- **EDM / Storm Overflow** terminology — `edm_annual_stats`, `spill_events`, `edm_snapshots`,
  `asset_unique_id` (EA EDM outlet id, e.g. `SBB00885`).
- **WINEP** — `winep_actions.driver_code` (`U_IMP1`, `EnvAct_*`…), `cycle` (`PR19`/`PR24`);
  EA-issued, 19 English companies only.
- **SODRP / SOAF** — `0042_sodrp_crosswalk.sql`; England policy (2035/2045/2050 deadlines), no
  devolved equivalent.
- **Bathing-water regime** — `eu_bwid`, classification bands (`src/lib/bathing.ts`); Bathing Water
  Regs (England).
- **Regulatory framing** — several method docs cite England-&-Wales SIs (`DRY-SPILL-METHOD.md`,
  `POPULATION-CAPACITY-METHOD.md`, `PRIORITY-SITES-METHOD.md`).
- **Census** — Nomis `NM_2021_1` = ONS Census 2021 (England & Wales); Scotland (NRS) and NI (NISRA)
  are separate.

Cross-UK therefore means: keep the core schema; add nation-specific importer adapters; parameterise or
feature-flag the England-only constructs (WINEP/SODRP); and accept feature gaps outside England.

---

## 4. Suggested phasing

1. **England live-feed adapter** (National Storm Overflow Hub) — unlocks any English catchment on the
   current model.
2. **Decide the deployment model** (federated-automated vs national multi-tenant) — gates everything
   else.
3. **Performance + matching hardening** for national data volumes.
4. **Wales** — shares the most; NRW/Dŵr Cymru connectors, drop WINEP/SODRP.
5. **Scotland**, then **Northern Ireland** — separate data-backend projects, scoped to what SEPA /
   NIEA actually publish.

---

## 5. Open questions to resolve before committing

- Federated-many-instances vs one national multi-tenant instance (vs regional)? (§2.2)
- Is a single national live feed (Storm Overflow Hub) usable, or are per-company adapters required? (§2.1)
- Is the product "England water quality" or a federation of community-group catchments? (drives §2.2)
- For the devolved nations, is the goal parity with England, or best-effort coverage of whatever the
  regulator publishes? (drives §3 scope)
