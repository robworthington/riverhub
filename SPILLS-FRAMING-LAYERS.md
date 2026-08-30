# Spills framing layers — Works & capacity + Problems & action

Implementation plan for the updated Claude Design handoff
(`~/Documents/GitHub/riverhub/design_handoff_sewage_spills/`, Aug 2026). The first handoff's
screens (board, asset detail, league, map, how-we-classify, watchlist) are live. This plan covers
the two **new** screens and the four-layer framing that ties the section together.

## The framing (from the handoff)

The section answers questions in four escalating layers, and that structure is the design:

1. **Cross-cutting data** — what's happening across the catchment. *(board, league — live)*
2. **Problems** — analysis pointing at specific assets: dry spills, spills ahead of works, very
   long spills, high frequency, unreliable feeds.
3. **Actions** — recorded measures against those problems (body, status, reference).
4. **Gaps** — a flagged problem with no action addressing it. **The headline number.**

**Capacity** cuts across all four at the works level: every overflow drains to a works serving a
fixed area. Crossing capacity against the spill record separates a works too small for its area
(remedy: capital investment) from a local blockage upstream (remedy: cheap maintenance now).

## Decisions (confirmed with Rob, Aug 2026)

- **Build both new screens together** — they share a case/diagnosis/verdict logic layer.
- **Actions = WINEP measures + a members-only manual asset↔measure link.** We hold WINEP/SORP
  (`winep_actions` + `public_winep_*`) but no EA enforcement register or FoD casework log. Instead
  of sourcing those, the password-protected area gets a control to **link any measure to any
  asset**. **A flagged asset with no linked measure is a gap.** This keeps the Gaps headline honest
  and fully under FoD's control.
- **Defer the housing-growth column.** No planning-consent data (South Hams DC / Dartmoor NP) is
  held; the "New housing" column and the "Growth on a full works" diagnosis are omitted for now.
- **Keep our 0.25 mm dry-spill method** (the handoff's 0.4/2 mm figures are placeholders). The
  15-min minimum and existing pre-STW logic stand.

## Data availability (checked against schema)

| Design needs | Source | Status |
| --- | --- | --- |
| Load vs permit | `system_capacity_v.demand_central_m3d` ÷ `asset_permits.permit_dwf_m3d` | ✅ have |
| Effective population served | `system_capacity_v.effective_population` | ✅ have |
| "Permit not found" state | `permit_dwf_m3d is null` | ✅ have |
| Works overflow hours / has-monitor flag | `spill_events` + asset types on the works | ✅ have |
| Upstream / pre-STW counts | existing pre-STW logic (`public_spills_board`, 0019/0020) | ✅ have |
| Problem flags (frequency, long, dry, pre-STW, dead feed) | `spill_events`, `edm_snapshots` | ✅ have |
| Actions | `winep_actions` + **new manual link table** | ✅ after Phase 0 |
| New housing / growth | none | ❌ deferred |
| Heartbeat per-interval | hourly `edm_snapshots` (design assumes 15 min) | ✅ adjust copy to hourly |

## Thresholds to confirm before publishing

Calibrated to the Dart (45 assets). Placeholders from the handoff, adjusted to our data:

**Problem flags (asset level), weight scales with magnitude:**

| Problem | Fires at | Weight |
| --- | --- | --- |
| High spill frequency | ≥400 spills since 2020 | 4 (5 if ≥800) |
| Spilling for very long periods | ≥500 h in the latest full year | 4 (5 if ≥900) |
| Dry spilling | ≥5 dry spills since 2020 | 3 (5 if ≥15) |
| Spills before its works | ≥4 events since 2020 | 3 (5 if ≥12) |
| Feed unreliable | no reading for ≥12 h | 2 |

**Capacity flags (works level):** over permit (load >100%), at the limit (load ≥95%),
permit not found. *(Growth flag deferred with the housing column.)*

**Capacity verdict / diagnosis (crossing capacity × spill record):**

| Diagnosis | Condition |
| --- | --- |
| Treatment capacity | load ≥95% and the works overflow is running |
| Network faults upstream | works has headroom (<95%) and ≥4 pre-STW events |
| Both | both of the above |
| Not assessed | no permit found |
| No capacity signal | neither |

**Verdict (per flagged asset, simplified per Rob's steer):** *Action under way* = ≥1 linked
measure; *No action recorded* = a gap. (The handoff's third "weak/distant" state — a measure that's
the wrong remedy or years out — is a later refinement once links carry a "problem addressed" tag.)

## Build phases

### Phase 0 — shared foundation (data layer + members linking)

- **Migration: manual measure links.** `winep_asset_links (id, winep_action_id, asset_id, note,
  created_by, created_at)`, unique on (action, asset). RLS: members write within their org; anon
  read via RPC only. This is the "manual link measures to assets" mechanism.
- **Members UI.** A "Measures" panel on the asset edit/detail page: search WINEP measures, link/
  unlink, optional note. (Reuses `winep_actions`; no new action taxonomy.)
- **Public RPCs (anon, security definer, org-scoped, ISR-cached hourly):**
  - `public_spills_works()` — per works: name, effective population, permit DWF, load %, verdict,
    overflow-at-works hours, has-monitor flag, upstream & pre-STW counts, diagnosis.
  - `public_spills_problems()` — per asset: the problem flags above + weight + total, plus whether
    it has a linked measure (→ gap).
  - `public_spills_measures_for_asset(asset)` — WINEP measures linked (manual links ∪ existing
    `winep_actions.asset_id`), for the asset detail "Is anyone acting on this?" card.
  - Funnel/matrix counts derived in the page from `public_spills_problems()`.

### Phase 1 — Works & capacity (`/explore/spills/works`)

Headline banner (N over permit, M at the limit, K unassessed, population affected) · works table
sorted by load with the 100%-line load bar, verdict chips, overflow-at-works, upstream/pre-STW,
diagnosis · "cannot assess" callout · "why this matters for reading spills" explainer columns.
Housing column omitted. Top-nav gains **Works & capacity**.

### Phase 2 — Problems & action (`/explore/spills/action`)

Headline banner (N problems with no action) · funnel (monitored → flagged → action → gaps) ·
problem × response matrix (clickable filters) · capacity problems (works-level case table) ·
per-overflow case rows (problem chips + evidence line + measures + verdict), defaulting to gaps.
Top-nav gains **Problems & action**.

### Phase 3 — asset-detail additions

"Can its works cope?" (capacity summary for the asset's works) and "Is anyone acting on this?"
(linked measures + gap/covered verdict) sections on `/explore/spills/[assetId]`.

### Phase 4 — polish

48-tick heartbeat strip (hourly cadence copy), board-spec conformance pass (column flex, fixed
sort, footer legend), map pin live-status semantics (label by asset name, not works town).

### Deferred (data-gated)

Housing-growth column + "growth on a full works" diagnosis (needs planning-consent data);
"weak/distant" verdict (needs a problem-addressed tag on links).

## Rollout

Additive throughout: apply each migration **before** the code deploy; reload the PostgREST schema
cache (`notify pgrst, 'reload schema';`). Dart first, then Teign — RPCs are generic, no per-instance
change. Teign degrades gracefully where capacity/permit data is sparser.
