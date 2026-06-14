# River Hub — data-gap checklist & action plan

*For Friends of the Dart (FotD) and Friends of the River Teign (FoRT), 14 June 2026. What the
platform already gathers automatically, what volunteers must collect and enter, and how to turn the
data into change at parish, district and MP level.*

## What the platform already does automatically (no volunteer effort)

- **Sewage-spill data** — hourly EDM sync from South West Water + EA Annual Returns (2021–2025).
- **Rainfall & river flow** — daily from EA gauges; powers the dry-spill classification.
- **Boundaries & population** — ONS parishes/districts + Census 2021.
- **Water bodies** — WFD catchment taxonomy; outlets carry EA bathing/shellfish flags.
- **Sewage assets** — the catchment's storm overflows, geocoded, typed, with spill history.

Everything below is what the platform **cannot** get on its own — it needs people, surveys, or
formal requests. This is the volunteer workstream.

---

## Part 1 — Data-gap checklist (what must be collected & entered)

Priorities: **P1** unlocks the headline compliance/advocacy case · **P2** strengthens it · **P3**
/ backlog = nice-to-have or needs a platform feature first. Tick as gathered.

### P1 — Permits & treatment capacity (the missing compliance limb) — *currently 0 records*
The single biggest gap. Without it we can only show a spill was in dry weather; *with* it we can
show the works spilled while **withholding flow it was legally required to treat** (Formula A
flow-to-full-treatment). Gathered mainly by **Environmental Information Regulations (EIR) requests**
to South West Water and permit lookups on the EA's public register.

- [ ] **Permit number** for each treatment works / overflow (EA public register / permit doc)
- [ ] **Flow-to-full-treatment (FFT) / pass-forward flow (PFF)** in m³/day — *the key figure*
- [ ] **Dry weather flow (DWF)** consented value (m³/day)
- [ ] **Required storage / processing volume** (m³)
- [ ] **Permit document** (PDF) attached for the record
- [ ] **Installed treatment capacity** (actual m³/day) + source — EIR response
- [ ] **EIR reference + dates** logged against each asset (audit trail)
> Enter via: each asset's **Permit** form (members app). One EIR request can cover all of a
> company's works in the catchment — see the EIR template action below.

### P1 — Water-quality sampling
- [ ] **Teign: start a sampling programme** — the Teign instance has **no water-quality data yet**
      (it launched spills-first). Choose priority sites (below) and begin.
- [ ] **Dart: keep sampling** the 130 existing sites; prioritise gaps in the record.
- [ ] **Per-sample context at the bankside** (these are sparsely recorded today):
  - [ ] **Rainfall / weather** at time of sampling (recorded on **0** Dart results so far)
  - [ ] **Wet/dry condition** (on ~66% of Dart results — fill the rest)
  - [ ] **CSO releasing nearby?** (24 h) — strengthens linkage of bacteria to a spill
  - [ ] Chain-of-custody photo for any sample headed to a lab
- [ ] **Priority sampling locations:** upstream/downstream of each repeat-offender overflow, just
      above designated/aspiring **bathing & shellfish waters**, and popular swim/access spots.
> Enter via: **Record sample** (mobile-friendly) — site + result + condition + weather + photo.

### P2 — Site metadata & context — *photos, what3words, access, ownership all empty*
- [ ] **Photographs** of each testing site and each storm overflow outlet (0 stored today) — visual
      evidence for dossiers
- [ ] **what3words / precise access point** for each site (0 today) — repeatability & safety
- [ ] **Land ownership / access permission** where relevant (0 today)
- [ ] **Link sites to their water body** — only **3 of 130** Dart sites are linked; assign the rest
- [ ] **Parish for the ~59 unlinked sites** (71/130 linked) — fixes council-area roll-ups

### P2 — Population & demand accuracy
- [ ] **Fill population for the ~29 parishes** currently missing a Census figure (bbox-edge parishes)
- [ ] **Local population overrides** where the ONS estimate is clearly wrong (holiday lets, large
      developments, seasonal load) — improves the capacity-vs-demand readout (0 overrides today)
- [ ] **Confirm system → parish/population mapping** for each treatment works' catchment

### P2 — Monitoring coverage
- [ ] **Register more EA river-flow gauges** — only **1** flow gauge covers the whole Dart; add
      gauges on major tributaries for better dry-spill corroboration
- [ ] **Check each asset's matched rain gauge is representative** (the dossier shows the distance);
      flag/repoint any asset whose nearest gauge is far or in a different sub-catchment

### P3 / backlog — needs a data layer or feature first (flag if wanted)
- [ ] **Designated-water boundaries** (bathing, shellfish, SSSI, chalk-stream geometries) for proper
      downstream-proximity scoring — *platform layer to be built*
- [ ] **Tide times** for tidal/estuary sites (so short tidal-artefact spills can be discounted)
- [ ] **Water-company commitments** (WINEP / price-review promises: what SWW has pledged to fix &
      by when) — *not yet modelled; lets you track promise vs delivery*
- [ ] **Advocacy / casework log** (who was contacted, responses, outcomes) — *not yet modelled*
- [ ] **Private/agricultural discharge permits** (non-water-company pollution sources)

---

## Part 2 — Actions to make full use of the data

Three streams running in parallel. Both groups can share templates, training and the methodology.

### A. Collect
- [ ] **Recruit & train samplers** — a short protocol per the bathing-water method; consistent kit.
- [ ] **Set a sampling rota** focused on the priority sites above (repeat offenders + near bathing
      waters), with per-sample weather/condition/CSO recorded.
- [ ] **Photograph every outlet and site** on a first sweep — instant evidence library.
- [ ] **Submit EIR requests** to South West Water for permits + FFT/PFF + installed capacity for
      every works in the catchment (one letter per group; reuse a shared template). Log the
      reference and chase at 20 working days.
- [ ] **Pull permit numbers / FFT** from the EA public permit register where already published.
- [ ] **Gather designated-water lists** (current + aspiring bathing waters, shellfish waters) to
      prioritise sampling and, later, the receptor layer.

### B. Analyse (using the platform)
- [ ] **Weekly dry-spill review** — open the Dry-weather spills page (default ≥15 min filter); watch
      the **repeat-offender** list (assets spilling dry across multiple years).
- [ ] **Build an evidence dossier** for each priority/repeat-offender spill (per-event page →
      Print/PDF + Download JSON) — the printable, methodology-cited pack.
- [ ] **Lead with High-confidence cases** — use the dossier's evidence-strength rating to pick the
      most defensible spills first.
- [ ] **Compile the EA-vs-precautionary comparison** per catchment (counted spills vs dry-weather
      discharge-hours, ahead-of-works, receptor-weighted) — the headline advocacy number.
- [ ] **Rank** sites by E. coli and assets by dry-spill count/duration; correlate high bacteria with
      nearby spill events to connect cause and effect.
- [ ] **Export** dry-spill CSVs for council/EA submissions and FOI/EIR follow-ups.

### C. Engage (turn data into change)
- [ ] **Parish councils** — share each parish's council-area page + dossiers for overflows in their
      patch; ask them to write to SWW/EA and support designated-bathing-water bids.
- [ ] **District councils (South Hams, Teignbridge, West Devon)** — feed evidence into Local Plan /
      planning responses (no new connections to overloaded works) and bathing-water applications.
- [ ] **MPs** — a constituency dossier (dry spills, ahead-of-works, hours, receptor risk) with a
      clear ask: EA/Ofwat enforcement, investment in the named works, faster WINEP delivery.
- [ ] **Environment Agency / Ofwat** — submit High-confidence dry-spill dossiers to the live
      enforcement investigation; request permit/FFT data via EIR if SWW won't supply it.
- [ ] **South West Water** — present the dry-spill + ahead-of-works evidence; ask for fix timelines
      and publish them (feeds the future Commitments tracker).
- [ ] **Apply for bathing-water designation** at popular swim spots using the sampling record — a
      legal lever that forces monitoring and improvement.
- [ ] **Public & media** — the public portal + share cards; a periodic "state of the river" using
      the precautionary figures.
- [ ] **Respond to consultations** — Price Review (PR), WINEP, the Storm Overflows Discharge
      Reduction Plan — citing the catchment's own numbers.

---

### How the two groups differ right now
- **Friends of the Dart** — rich water-quality record (130 sites, 2,538 results); biggest gaps are
  **permits/FFT**, **site photos/metadata**, **site→water-body links**, and **more flow gauges**.
- **Friends of the River Teign** — sewage/spill data is live, but **water-quality sampling is
  greenfield** — the priority is standing up a sampling programme alongside the same permit-EIR push.

Both share the identical method and platform, so evidence, templates and a designation bid built by
one group transfer directly to the other.
