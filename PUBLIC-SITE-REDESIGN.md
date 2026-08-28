# Public site redesign — Explore

*Plan for re-implementing the public `/explore` site to the Claude Design "Sewage Spills Redesign"
handoff and its design system. The handoff (a high-fidelity HTML prototype + README) redesigns the
Spills section in full and defines a token/type/spacing system intended to extend across the whole
public site. This doc turns it into a build plan.*

## Decisions (agreed)

1. **Dry-spill method — keep ours.** Use River Hub's existing definition (≤ 0.25 mm rain on the spill
   day and the day before; < 15-min single-interval events excluded), **not** the prototype's
   0.4 mm/24h + 2 mm/72h. The "How we classify" explainer must describe *our* method.
2. **Live cadence — hourly.** The EDM cron runs `0 * * * *`. Freshness copy reads "updated hourly" /
   "updated {time}", not "every 15 minutes".
3. **Feed health — simplified.** No per-poll heartbeat strip (we don't store sub-day interval
   history). Show a single freshness indicator per asset from `edm_snapshots.last_updated` /
   `fetched_at`: Reporting (recent) / Quiet Nh / No data (> 24h).
4. **Watchlist — localStorage only.** No account backing on the public site.
5. **Design all sections up front.** Spills is fully designed; produce designs for the other five
   sections (Pollution map, Water quality, EA monitoring, Improvements, Councils) in the same
   language **before** building them.

## Design system (from the handoff)

- **Colour:** two backgrounds dominate — Paper `#f4f2ec` (page), Card `#fffdf8`. Ink `#101b1d` text.
  Accents carry fixed meaning: Teal `#0d6b62` (OK/links/not-spilling), Red `#b8342a` (spilling),
  Amber `#c07a12` (stopped recently / stale feed / watchlist), Purple `#6b4a8f` (dry spill),
  Rust `#9a4415` (pre-STW), Slate `#7c94a6` (wet/permitted), Grey `#7d8a8c` (no data). Full table in
  the handoff README.
- **Type:** Archivo (UI/body, 400–700) + IBM Plex Mono (all numerals, timestamps, codes, chips) from
  Google Fonts. Every comparable figure is mono so columns align.
- **Shape:** radius 3px everywhere (chips 2px), **no shadows** (except map pins), left/top **accent
  bars** carry meaning (stat cards `border-left: 4px`, answer cards `border-top: 3px`). One pulse
  animation for live-spilling elements; respect `prefers-reduced-motion`.

## Data fit

| Design needs | Source | Status |
|---|---|---|
| Live status (spilling now / start / last end) | `edm_snapshots` (hourly sync) | ✅ |
| Historic per-event 2020–2026 | `spill_events` + `classify_spills` / `classify_spills_yearly` | ✅ |
| Dry/wet classification | our 0.25 mm method | ✅ (decision 1) |
| Pre-STW ("spilled before its works") | `public_spills_ahead` RPC already exists | ✅ mostly |
| Feed health | `edm_snapshots.last_updated`/`fetched_at` → simplified freshness | ✅ (decision 3) |
| League aggregates (hours / dry / pre-STW) | derive from `spill_events` | ➕ new RPC |
| Board rows (per-asset live + period dry/wet/total + flags) | derive | ➕ new RPC |

New public RPCs to add: `public_spills_board(p_period)`, `public_spill_asset(p_asset, p_year)`,
`public_spill_events(p_asset, p_year)`, `public_spills_league(p_period)`. Cache annual aggregates;
only live status needs frequent revalidation.

## Spills views → routes

| View | Route | Notes |
|---|---|---|
| Live board | `/explore/spills` | replaces the current 151-line summary table |
| Asset detail | `/explore/spills/[assetId]` | new |
| League table | `/explore/spills/league` | new |
| Explainer | `/explore/spills/about` | new — describes *our* method |
| Map live-status layer | fold into `/explore/map` | pin colour = status logic |
| Watchlist | `/explore/spills?filter=watchlist` | localStorage |

State lives in URL query (`period`, `filter`, `query`, `assetYear`) so views are shareable; watchlist
in localStorage.

## Phasing

- **Phase 0 — design-system foundation (site-wide).** Tailwind tokens (`rh.*` colours + `font-archivo`
  / `font-plexmono`), load the two Google Fonts, pulse keyframe, and the shared primitives:
  `StatCard`, `Chip`, `StatusDot`, `MixBar`, `PeriodBar`. Applied to the public shell (paper bg, ink
  text, Archivo). **← starting here.**
- **Phase D — design the other five sections up front** (decision 5): Pollution map, Water quality,
  EA monitoring, Improvements, Councils, in the new language.
- **Phase 1 — Spills board** (`/explore/spills`): `public_spills_board` RPC, stat cards, "spilling
  right now" panel, sorted asset table, filter chips + search (URL), watchlist stars.
- **Phase 2 — Asset detail** (`/explore/spills/[assetId]`): status hero, since-2020 bars, flagged
  tables, monthly chart, per-event log, CSV export, simplified feed-freshness.
- **Phase 3 — League** (`/explore/spills/league`): three-panel RPC, period-scoped.
- **Phase 4 — Map live-status layer** on `/explore/map`.
- **Phase 5 — Build the other five sections** from the Phase D designs.

## Notes / guardrails

- The prototype's data is fake except the 2025 per-asset dry/wet counts; **do not port** its generator
  functions. Rebuild against real River Hub data.
- Every clickable row/card/pin is a real `<a>`/`<button>` (keyboard + screen-reader); table column
  strips must not `flex-wrap` — below min width switch to stacked cards.
- Never let a card make an all-time claim from a year-scoped number — always state the year and the
  since-2020 figure.
