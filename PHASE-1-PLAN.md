# River Hub — Phase 1 plan: national core on cloud

**Status:** draft for review · **Date:** 2026-10-24 · **Parent:** `UK-PLATFORM-SPEC.md` (Phase 1 of §9)

## Goal

Turn the single-river site into a national, multi-river site **on the current cloud stack**, so that **any English South West Water river can be added as data** (config + load), with Dart and Teign living in one database. Per the confirmed decisions: one org per river in one DB; national Storm Overflow Hub for live status; one national domain (`/r/<river>`) plus optional vanity domains; England only.

**Definition of done**
- One deploy, one database, serves many rivers.
- `/r/<river>/…` shows today's per-river pages, river-branded, for Dart and Teign.
- A national summary landing page and a river chooser are live.
- The hourly sync keeps every river's live status current via the national Hub (history still from the EA Annual Return).
- Adding a new SWW river is a config + data load — no code change, no new deploy.

---

## Workstreams

### A. Schema & migration foundation
*New append-only migrations; preserve the "apply full sequence → clean empty instance" property.*
- A1. Add to `organisations` (or a `rivers` view over it): `slug` (unique), `region`, `live` (bool), and the runtime-branding columns (see C). Backfill Dart/Teign.
- A2. Retire the single-row dependency: keep `app_config`/`public_org()` working as a **default** for backwards compatibility, but stop new code depending on it.
- A3. National **materialised views** for the summary rollups (per-river and England totals: spills, dry spills, hours, gaps, reduction-vs-baseline), refreshed on the sync tick.
- A4. **Indexing** for national query paths (`(organisation_id, …)` on `spill_events`, `edm_snapshots`, `winep_actions`); defer `spill_events` partitioning to Phase 2 unless load demands it sooner.
- *Acceptance:* migrations apply clean to an empty DB and to the existing Dart DB; matviews populate; EXPLAIN shows index use. *Est: 2–3 d.*

### B. Public portal — de-single-org (the core change)
- B1. **River resolution:** a server helper that maps an incoming river (from `/r/<slug>` path, or a vanity host) to an org id; 404/"not yet covered" for unknown slugs.
- B2. **Route move:** nest the current public IA under `/r/[river]/explore/…` (keep the four-question structure). Redirect legacy `/explore/…` to a default or the chooser.
- B3. **River-aware RPCs:** add `p_org uuid` parameters to every `public_*` RPC (overload alongside the existing `public_x()` so it's append-only), resolving the org from the slug instead of `public_org()`. Update every call site in `src/app/(public)/**` to pass the resolved org.
- B4. **Members app:** add a river switcher for multi-river users (members are already org-scoped via `profiles.organisation_id`).
- *Acceptance:* Dart and Teign public pages render identically to today under `/r/dart/…` and `/r/teign/…`; no page still calls a `public_org()`-only RPC. *Est: 5–8 d (the bulk — signatures + call sites + routing).*

### C. Runtime branding
- C1. Move the per-river `INSTANCE` fields (name, logo, portal name, river name, company name, marketing/donate URLs, map centre/zoom, `capacityResponse`) onto the `organisations` row.
- C2. A request-time `getRiverBranding(org)` helper replaces build-time `NEXT_PUBLIC_*` in the public pages; keep genuinely global config (Supabase URL/keys) in env.
- C3. Logos/marks move to storage or per-river asset paths.
- *Acceptance:* changing a river's branding is a data edit visible without a redeploy. *Est: 2–3 d.*

### D. National summary + river chooser
- D1. **National aggregate RPCs** (`national_*`) over the matviews from A3, anon-granted, under the 3 s timeout.
- D2. **Summary page** (`/`), featuring all four confirmed blocks: headline England numbers; gap number + worst-offender leagues; reduction tracking vs the 2020 baseline / SODRP; coverage/adoption map + calls to action.
- D3. **River chooser:** England catchment map + search/dropdown → `/r/<slug>/explore/spills`; "not yet covered — register interest" for rivers not live; remember last river (localStorage).
- *Acceptance:* summary loads under 3 s against the full national dataset; chooser routes to any live river. *Est: 4–6 d.*

### E. Live-feed adapter (national Storm Overflow Hub)
- E1. New adapter module for the national Hub feed, mapping its schema to `edm_snapshots` (replacing the hardcoded SWW `ARCGIS_URL` / `OutletAttrs` in `src/lib/edm/sync.ts`).
- E2. Make the sync **feed-driven** off `company.edm_feed` (field exists, runtime currently ignores it); Hub as default, per-company adapter as fallback where the Hub is weak.
- E3. Keep the EA Annual Return history path unchanged; keep the stall-grace + revalidate logic; add per-river "last successful sync" surfacing.
- *Acceptance:* Dart and Teign live status stays current from the Hub; a non-SWW test river reports; history unaffected. *Est: 3–5 d (incl. Hub coverage validation).*

### F. Data migration & cutover
- F1. Designate/stand up the national DB; apply the full migration sequence + A–E migrations.
- F2. Load the Dart and Teign orgs into it (both already org-scoped and id-clean); set slugs (`dart`, `teign`) and branding rows.
- F3. Domains: point the national domain at the app; map the existing vanity domains (`riverhub.friendsofthedart.org`, the Teign host) to their river.
- F4. **Parallel run**: diff `/r/dart` and `/r/teign` against the live sites; smoke-test the sync; agree a rollback.
- F5. Cut over, then retire the two separate Vercel/Supabase projects; update the instance registry.
- *Acceptance:* both rivers serve from the national site; old instances retired; sync green. *Est: 3–5 d.*

---

## Sequencing

```
A (schema) ─┬─> B (portal de-single-org) ─┬─> D (summary + chooser)
            ├─> C (runtime branding) ──────┘
            └─> E (live-feed adapter)  ──────> F (migrate Dart+Teign, cutover)
```
A first (everything builds on the schema). B and C in parallel after A. E can proceed in parallel with B/C. D needs A+B. F last, needs all.

## Testing
- Per-river parity: automated snapshot/diff of each public page under `/r/<slug>` vs the current live instance.
- National RPCs under the 3 s anon timeout against full-scale data (seed a non-SWW company's data to test scale before cutover).
- Sync: Hub adapter against Dart/Teign + one new company; stall-grace still fires; `revalidateTag` per river.
- Migration dry-run on a staging copy before the real cutover.

## Effort

| Workstream | Est (days) |
|---|---|
| A. Schema & migrations | 2–3 |
| B. Portal de-single-org | 5–8 |
| C. Runtime branding | 2–3 |
| D. Summary + chooser | 4–6 |
| E. Live-feed adapter | 3–5 |
| F. Migration & cutover | 3–5 |
| Testing / buffer | 3–5 |
| **Total** | **~22–35 days (≈ 4–7 weeks; ~£13–21k at £600/day)** |

## Risks & micro-decisions
- **B is the long pole** — many RPC signatures + call sites. The append-an-overload approach keeps it safe and incremental (ship river-aware RPCs behind the slug route, drop `public_org()` last).
- **Hub coverage** — validate the Storm Overflow Hub per company during E; keep the per-company adapter fallback ready (decision already taken to start with the Hub).
- **Caching** — `revalidateTag("public-rpc")` must become per-river (tag per org) so one river's sync doesn't needlessly bust another's cache.
- **Summary performance** — rollups via matview only; never scan raw `spill_events` on the national page.
- **Micro-decisions to confirm during build:** matview refresh cadence (on sync tick vs scheduled); default landing for bare `/explore` (redirect to summary vs chooser); whether the members app also moves branding to runtime now or stays on env until Phase 2.

## First task
Start with **A1 + B1/B3 for one RPC end-to-end** — add `slug`/branding to `organisations`, build the river-resolver, and convert a single public RPC (e.g. `public_spills_problems`) to take `p_org`, proving the `/r/<slug>` path renders one page river-aware. That de-risks the long pole (B) before committing to converting all call sites.
