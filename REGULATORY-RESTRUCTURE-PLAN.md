# Spills section — regulatory restructure plan

Implementation plan for the `design_handoff_spills_regulatory` handoff (option **1a — "Four
questions"**, Aug 2026). It reorganises the public Spills section into a four-section, two-tier IA
and adds a regulatory layer (lawfulness tests, permit conditions, the WINEP register, a statutory
calendar). Builds on the framing-layers work already live (see [SPILLS-FRAMING-LAYERS.md](SPILLS-FRAMING-LAYERS.md)).

## What this is

Six flat tabs → four sections named as the questions a reader arrives with, each with tier-2 sub-tabs.
**Diagnosis** is the organising idea: every problem names what the data indicates, the likely remedy,
and the accountable body.

### Information architecture

| Tier 1 | Route | Tier-2 tabs |
| --- | --- | --- |
| What's happening now | `/explore/spills` | Live board · Map |
| Why it keeps happening | `/explore/spills/why` | Overview · Dry spilling (`/why/dry`) · Before the works (`/why/before-works`) · Works & capacity (`/why/capacity`) |
| Who is fixing it | `/explore/spills/measures` | Measures (`/measures`) · Gaps (`/gaps`) · Calendar (`/calendar`) |
| How we know | `/explore/spills/method` | *(single page)* |

**Redirects (keep old links + sitemap alive):** `/league → /why`, `/works → /why/capacity`,
`/action → /gaps`, `/about → /method`.

This restructures the three pages we just built (works, action, league) — their content largely
survives, moved under the new routes and reframed, with regulatory layers added.

## Already built vs new

**Reuse as-is (data):** `public_spills_board`, `public_spills_works`, `public_spills_problems`,
`public_spills_measures_for_asset`, `public_spill_asset/events/flagged/year_range`,
`public_spills_league`, `winep_asset_links`, `public_winep_*`, `system_capacity_v`, `asset_permits`,
pre-STW logic, `classify_spills*`, `dryspillConfidence`. `AssetMeasuresManager` (members linking)
already exists. **No new migrations expected** — this is largely a front-end + copy build.

**New code:**
- `src/lib/winep.ts` — `actionTypeFromDriver(code)` → `investigation | monitoring | improvement | no-deterioration` (handles `INV`/`MON`/`IMP`/`ND`/`NDINV`/`NDLS`). Pure helper shared by the register + asset page.
- `src/lib/calendar.ts` — typed statutory-calendar entries; countdown computed at render.
- `PUBLIC_SECTIONS` in `src/lib/nav-config.ts` (mirrors the existing members `SECTIONS`; reuse `activeSection`/`activeTabHref`).
- New tint tokens in `tailwind.config.ts` (dry panel `#f5f0fa`/`#d3c3e4`, pre-works `#fdf1ea`/`#e6c4ad`, amber chip, teal chip, alarm borders).
- 8 new/reworked pages + asset-page extensions (below).

**Static content (no DB source):**
- Bathing-water classifications for the 4 Dart sites (Warfleet/Dittisham EXCELLENT, Steamer Quay/Stoke Gabriel POOR) — FoD's own record; a typed constant.
- Statutory calendar dates.
- Regulatory copy (reg 4 test, OEP notices, permit conditions, SOAF triggers).

## Phased build

### Phase 1 — IA skeleton (structure before content)
Tier-1 nav (4 sections) + tier-2 sub-tab strip in `(public)/layout.tsx`, driven by `PUBLIC_SECTIONS`.
Create section routes; **move** existing content with minimal change: board stays at `/explore/spills`;
works → `/why/capacity`; action → `/gaps`; about → `/method`; league content → `/why` + `/why/dry`.
Add the four redirects. Nail the fiddly nav states (transparent inactive borders, `<button>`/`<a>`
only, visible focus rings). Ship this first so nothing 404s while the rest is built.

### Phase 2 — "Why it keeps happening"
- `/why` overview: 3 indicator cards (dry / over-permit / pre-works counts), the concentration table,
  the "what this cannot see" panel. **Framing guard:** no speculative cause text.
- `/why/dry`: reg-4 lawfulness panel, 4 stat cards, repeat-offenders table with `dryspillConfidence`,
  two explainer panels. Folds in the league repeat-offenders.
- `/why/before-works`: pre-STW hero + table + both-monitors caveat.
- `/why/capacity`: the existing works table + regulatory additions (Formula A, growth→spills).

### Phase 3 — "Who is fixing it"
- `src/lib/winep.ts`, then `/measures`: the WINEP register (`public_winep_actions`) with the derived
  Type column, driver chips, due-date urgency, "no change log" + "2027 pressure point" panels.
- `/gaps`: the action-page content reframed — headline banner, ranking explainer (keep the
  "unlinked ≠ nothing being done" clause), severity-ranked gap cards (reuse `PROBLEMS[].color`).
- `src/lib/calendar.ts` + `/calendar` table.

### Phase 4 — "How we know" (`/method`, replaces `/about`)
Part 1 the rules (reg 4, permit conditions, SOAF triggers); Part 2 the 2×2 classification; Part 3 the
threshold table (matches SPILLS-FRAMING-LAYERS.md) + confidence + "what we cannot see"; sources +
the 8 method-doc links (dry-spill pinned to `7b59571`, rest to `main`).

### Phase 5 — Asset page regulatory extensions
"Why this one spills" verdict, "Its permit" panel (pass-forward flow = permit DWF; spill-frequency
limit / monitoring tier show "Not published" where absent — the absence is the finding; SOAF
assessment trigger computed from spill counts), "What you can do about this one" (3 dated actions),
section reorder.

### Phase 6 — Cross-cutting polish
"One source per statistic": route every figure that appears on >1 screen through one selector
(catchment dry totals, gap count, over-permit count, measure counts). Focus rings, empty-state copy,
responsive column→stack, the new tint tokens.

## Data gaps / decisions to confirm

1. **Regulatory copy needs sign-off before publish.** The copy is grounded in the *FoD English Sewage
   Regulation Reference Report* (not in the repo), and its own provenance note flags several items as
   unverifiable — specifically the **2027 SODRP-target review** (a plan commitment, not confirmed
   statutory duty), the **15 Oct 2026 bathing-water deadline** (reconfirm with Defra), and the
   **site-level 2025 bathing classifications** (FoD's record, not a re-verified EA source). Recommend
   building the pages but gating those specific claims on Rob's confirmation.
2. **Permit conditions** (spill-frequency limit, monitoring tier) are not in our schema. The design
   already handles this — show "Not published / None set", treating absence as the finding. SOAF
   trigger is computable from spill counts. No new data needed; confirm we're happy publishing the
   "not published" framing.
3. **Bathing-water strip** is static (4 sites, FoD record). Fine as a typed constant, pending (1).

## Rollout

Front-end throughout; deploy per phase. If any RPC gap surfaces, apply the migration before the code
deploy and reload the schema cache. Dart first, then Teign.
