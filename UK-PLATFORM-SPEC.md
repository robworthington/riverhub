# River Hub — UK platform spec

**Status:** draft for review · **Date:** 2026-10-24 · **Builds on:** `NATIONAL-SCALING.md`, `PROVISIONING.md`, `VOLUNTEER-DATA-AND-ACTIONS.md`, `REGULATORY-RESTRUCTURE-PLAN.md`

## Summary

Move River Hub from one site *per river* (Friends of the Dart, Friends of the River Teign, each its own Supabase + Vercel project) to **one national site** that holds every river, opens on a **national summary**, lets a visitor **choose a river**, and then shows the per-river pages we have today. England first; the architecture leaves clean seams for Wales, Scotland and NI later. Phase 2 adds volunteer tools: EIR-request tracking, a NIRS register, and a water-company/EA investigations register.

The important finding from the doc review: **this is mostly a data-and-scale job, not a rebuild.** Every heavy analytical layer already comes from England-wide EA/national datasets, every table already carries `organisation_id`, and the hourly sync already loops all orgs. Three things actually change: (1) the **public portal**, which is currently hard-wired to a single org, becomes river-aware; (2) the **live spill feed**, currently hardcoded to South West Water, becomes multi-company; (3) **branding** moves from build-time env vars to runtime per-river config. Everything else is scale, matching QA, and new features.

---

## Decisions (confirmed 2026-10-24)

1. **Tenancy** — **one `organisation` per river in a single database**, reusing the existing org-scoping and RLS; the public portal resolves the river from a slug (§3.1–3.2).
2. **Live feed** — **national Storm Overflow Hub first** (one adapter for all companies), with per-company adapters added only where the Hub is weak; regulatory history stays on the EA Annual Return (§3.4). Hub coverage/quality is validated per company during the build.
3. **Domains** — **one national domain** with rivers as paths (`/r/<river>`), plus an **optional vanity domain** per group mapping to their river (§4.2, §8).
4. **Nations** — **England only** for the first build; leave adapter seams for Wales/Scotland/NI, build none now (§1).
5. **National summary** — feature **all four** content blocks: headline England numbers; the gap number + worst-offender leagues; reduction tracking vs the 2020 baseline / SODRP; and the coverage/adoption map with calls to action (§4.1).
6. **Hosting** — build national on the **current cloud first**; **cost is the sole agreed trigger** to move to self-hosting (if cloud compute at national scale exceeds the ~£10–16k/yr self-host band). Data-ops capacity, sale/handover, and sovereignty were considered and are **not** deciding factors on their own. Keep the architecture portable regardless (§6).

---

## 1. Vision & scope

**Goal.** A single site — "River Hub" for the whole country — where anyone can see the national picture, drop into their own river, and find the same evidence the Dart and Teign sites show today. Volunteer groups adopt a river rather than run a server.

**In scope (this spec)**
- One multi-tenant site covering **all English rivers**, with a river as the unit of tenancy.
- A **national summary** landing page and a **river chooser**.
- The existing per-river page set, unchanged in substance.
- An **evaluation of self-hosting** vs the current cloud, with a recommendation and migration path.
- **Phase-2 volunteer tools**: EIR-missing-data tracker, EIR-from-findings / casework log, NIRS register, investigations register.

**Explicitly later (seams only, not built now)**
- Wales, Scotland, NI. England's data regime (EDM Annual Returns, WINEP, SODRP/SOAF, EA bathing/nature bands, WFD `GB…` ids, ONS Census) has no direct equivalent elsewhere; each devolved nation is a separate adapter and dataset. We leave feature-flag seams, nothing more (`NATIONAL-SCALING.md` §3).

**Non-goals.** No change to the dry-spill method, the hourly cadence, the four-question public IA, or the regulatory framing. We evolve the current site; we don't redesign it.

---

## 2. Current state (what we're building on)

- **Stack:** Next.js 15 / React 19, Supabase (Postgres + **PostGIS**, Auth, Storage), Vercel (app + sync cron), Python 3 importers, AGPL-3.0 (`README.md`).
- **Tenancy is already in the schema.** Every row carries `organisation_id`; RLS is enforced through `current_org()` and `is_admin()` (`0001_schema.sql`, `0002_rls.sql`). Roles: `admin | volunteer` (+ a read-only viewer). The sync cron runs as the service role and **already loops every org** (`src/app/api/cron/edm-sync/route.ts`).
- **The single-tenant assumption lives in one place:** the public portal. `app_config` is a **single-row** table holding one `public_org` uuid, and every anonymous `public_*` RPC resolves its org through `public_org()` (`0030_public_org_config.sql`). One database can already hold many orgs; the public site just only ever shows one.
- **Per-instance deployment:** one Supabase project + one Vercel project + one `organisations` row per river, catchment specifics in `config/catchments/<slug>.json`, a working empty instance in ~half a day plus the data load (`PROVISIONING.md`). Branding is `NEXT_PUBLIC_*` env, **inlined at build time** — a per-river change needs a redeploy.
- **Migrations are append-only and org-guarded** so applying the full `0001`–`0080` sequence yields a clean empty instance (`MANIFEST.md`). Any refactor must preserve that property.

---

## 3. Target architecture

### 3.1 River as tenant, one database

Keep `organisation_id` as the tenancy key and make **one org per river catchment**, all in a single database. This reuses the entire existing org-scoping and RLS model unchanged. "Organisation" stays the internal term; "river" / "catchment" is the user-facing one.

### 3.2 De-single-org the public portal (the #1 change)

Replace the single-row `app_config.public_org` with **river-aware resolution**:

- **Routing:** public pages move under a river segment, `/r/<river-slug>/…` (e.g. `/r/dart/explore/spills`), with the current `/explore/…` IA nested beneath. A visited slug resolves to an org id.
- **RPCs:** the `public_*` functions take an explicit `p_org uuid` (resolved from the slug) instead of calling `public_org()`. Keep a thin compatibility shim so existing per-asset RPCs change signature once, not their logic.
- **National layer:** add a set of **cross-org aggregate RPCs** (`national_*`) for the summary page — totals, leagues, gaps, coverage — querying across all orgs, served from materialised views (see 3.5).
- A `rivers` view (or columns on `organisations`) exposes slug, display name, region, water company, centre/bbox, and a `live` flag, powering the chooser and the summary.

Members' app is already org-scoped through `profiles.organisation_id`; it needs only a river switcher for users who cover more than one.

### 3.3 Runtime branding (remove build-time env)

Move the per-river parts of `INSTANCE` (name, logo, colours, marketing/donate links, map centre/zoom) from build-time `NEXT_PUBLIC_*` onto the **`organisations` row**, read at request time per river. One build serves every river; adding a river becomes data, not a redeploy. (Genuinely global config — Supabase URL, keys — stays in env.)

### 3.4 The live spill feed — multi-company (the one real code gap)

Today `src/lib/edm/sync.ts` hardcodes the SWW `NEH_outlets_PROD` ArcGIS feed and an SWW-specific `OutletAttrs` shape, and runs it for every org. The `company.edm_feed` config field exists but is ignored.

- **Preferred:** point the live sync at the **national Storm Overflow Hub / Stream** aggregated feed — one adapter covering all companies. Caveat (`EDM-DATA-SOURCING.md`): that near-real-time hub is a *different, un-audited* methodology — fine for **live status**, but the **regulatory spill history stays on the EA Annual Return FeatureServer** (already national, already imported).
- **Fallback / supplement:** make the cron **registry-driven** off `company.edm_feed` with ~9 per-company field-mapping adapters, for any company not well served by the hub.
- Everything else on the live path (branding, company name, map centre) is already parameterised.

### 3.5 Performance at national scale

National volumes are large — ~5,600 storm overflows, ~24,000 WINEP actions, **millions** of `spill_events` (`NATIONAL-SCALING.md` §2.3). The anon role has a **3 s `statement_timeout`**, and we've already hit the PostgREST row cap once (fixed by SQL aggregation, `0048`).

- **Materialised views** for the national summary and per-river rollups, refreshed on the sync tick.
- **Indexing** on `(organisation_id, …)` for every public query path; **partition `spill_events`** by org and/or year.
- Keep every anon RPC under 3 s; resolve the org once as an InitPlan (the pattern already used).
- Per-river pages stay fast because they filter to one org; the national page reads pre-aggregated rollups, never raw events.

### 3.6 Data-matching hardening

Even within SWW there's outlet-id drift (`NRA-SW-*` → `SWW*` → `SBB*`) and co-located SO/SSO conflation (`NATIONAL-SCALING.md` §2.4). Across ~9 companies the id/naming schemes multiply. National onboarding needs per-company matching rules plus a QA step (the `winep_import_log` / audit pattern we built generalises to this).

---

## 4. Information architecture & UX

### 4.1 National summary (the new landing page) — proposed content

Content is TBC; this is the proposal. The page should answer "what's the national picture, and is my river on here?" and route people inward.

- **Headline England numbers:** monitored storm overflows tracked; total spill hours and discharge events in the last full year; **dry spills** (the signature metric); share of treatment works estimated over their permitted flow.
- **The national gap number** — overflows with a flagged problem and **no measure on record** (the site's existing headline accountability figure, aggregated nationally).
- **Leagues / worst offenders** — dry-spilling and before-the-works overflows ranked nationally, each linking into its river.
- **Reduction tracking** — are spills falling against the 2020 baseline / the SODRP, nationally.
- **Coverage map** — which rivers are **live on River Hub** vs not yet, and per-river **data completeness** (are permits received, is the live feed reporting). This doubles as the adoption pitch ("your river isn't here yet").
- **The chooser** (see 4.2) and clear calls to action: explore your river, adopt your river, donate, the national-spending campaign hook.

### 4.2 River chooser

A map of England's catchments plus a search/dropdown. Selecting a river routes to `/r/<slug>/explore/spills` — the existing live board. Rivers not yet onboarded show as "not yet covered — register interest / adopt this river." Remember last-chosen river (localStorage) so returning visitors land on their river.

### 4.3 Per-river pages — unchanged

The current public IA carries over verbatim, nested under the river slug (`REGULATORY-RESTRUCTURE-PLAN.md`, the "four questions"):
- **What's happening now** (live board · map · emergency overflows)
- **Why it keeps happening** (overview · dry spilling · before the works · treatment-works capacity)
- **Who is fixing it** (what the regulator requires · gaps · reduction tracker · the calendar)
- **How we know** (method)
- plus **Why River Hub**.

### 4.4 Members app

Unchanged in structure; add a **river switcher** in the header for multi-river users, and host the Phase-2 volunteer tools (§7) as new member sections.

---

## 5. Data & onboarding at scale

**Already national, ≈ zero per-river work** (config + data load): EDM annual history, WINEP (PR24+PR19), WFD water bodies/catchments, EA water quality (WIMS) + samples, rainfall/flow, protected areas, parishes + population, works grouping (`NATIONAL-SCALING.md` §1). `setup_catchment.py` orchestrates them idempotently.

**Still per-river human work:**
- **Catchment definition** — choosing the WFD `wb_ids` that drain to the river is a map-reviewed judgement call plus the estuary polygon and bbox/centre (`CATCHMENT-METHOD.md`). The main genuine setup task; partly automatable with a "suggest water bodies by proximity/topology, human confirms" tool.
- **Permits / treatment capacity** — FFT/PFF, DWF, storage, installed capacity, mostly via **EIR** to the company (`PERMITS-MATCH-AND-GAPS.md`, `POPULATION-CAPACITY-METHOD.md`). One EIR can cover all of a company's works in a catchment.
- **Emergency overflows** — EIR-only snapshot.
- **System-grouping review, flow-gauge selection, site metadata, citizen sampling** — per-river volunteer work.

**National onboarding pipeline (new):** a batch runner that stands up all English catchments from a central catchment registry — bulk WFD/EDM/WINEP loads once, per-catchment config generated semi-automatically, then a QA queue for the matching and grouping. This is what turns "half a day per river by hand" into "the national set, triaged."

---

## 6. Hosting evaluation — self-hosted server vs current cloud

The question: keep the national site on **Vercel + Supabase**, or run it on **our own server(s)**.

### 6.1 What actually ties us to the cloud

Very little. The stack is standard and portable: Supabase = Postgres + PostGIS + **GoTrue** (Auth) + **Storage** + **PostgREST**, all self-hostable; the importers are plain Python hitting public open-data APIs (no lock-in). The only Vercel-proprietary pieces are **cron scheduling** (trivially replaced by a systemd timer / OS cron / a small worker) and **`revalidateTag` ISR caching** (needs a Next.js self-host caching story — a solved problem). So self-hosting is an operational choice, not a re-platform.

### 6.2 Comparison

| Factor | Cloud (Vercel + Supabase), one national project | Self-hosted (VPS, Docker Compose) |
|---|---|---|
| **Setup effort** | Lowest — managed Auth/Storage/backups/scaling | Higher — stand up Postgres+PostGIS, PostgREST, GoTrue, Storage, Next.js, cron, reverse proxy, backups |
| **Ongoing ops** | Low (managed) | Higher — patching, backups, uptime, Postgres tuning are yours |
| **Cost at national scale** | Grows with DB compute for millions of rows; still modest (~£10–16k/yr infra band, `RiverHub_expansion_cost_model` National tab) | Lower and **predictable** — a single capable VPS + managed off-site backups can serve all England in the same band or less |
| **Per-tenant limits** | Moot once it's **one** project (the per-instance Supabase-free-tier / per-project `CRON_SECRET` multiplication problem disappears) | None |
| **Build-time env constraint** | Removed anyway by moving branding to runtime (§3.3) | Removed |
| **Data control / sovereignty** | Data sits with vendors | **Full control** — strongest for credibility and for a future sale |
| **Resilience** | Vendor SLAs, little for us to run | Our responsibility; needs real backup/restore + monitoring discipline |
| **Portability / exit (sale)** | Tied to two vendor accounts | Clean, self-contained, handover-friendly |
| **Fit with the funding model** | Fine | Fits the national model's assumed **0.5–1 FTE** of data-ops, who can also own the server |

### 6.3 Recommendation

**Build the national multi-tenant site on the current cloud stack first; treat self-hosting as a deliberate, low-risk later migration, and keep the architecture portable so the door stays open.** Rationale:

- Going national on cloud is the **fastest, lowest-risk** path, and the main reason to leave cloud (per-project multiplication) **vanishes** once it's a single national project.
- The strongest arguments *for* self-hosting — **cost predictability, data sovereignty, and clean portability for a sale** — are real but they are long-term, and none of them is blocked by shipping on cloud first. Nothing in the build creates lock-in (§6.1).
- **When to switch** (agreed trigger): **cost is the sole deciding factor** — if cloud/Supabase compute at national scale climbs past the self-host band (~£10–16k/yr). Data-ops capacity, a sale/handover, and sovereignty were weighed and set aside as triggers in their own right (they remain reasons the portability matters, not conditions that force a move).

**Recommended self-host target (for when the trigger fires):** a single well-specced VPS running **Docker Compose** — Postgres 16 + PostGIS, PostgREST, GoTrue, an S3-compatible object store (for the private `evidence` bucket, `0002_rls.sql`), the Next.js app with its own ISR cache, and a **cron worker** replicating the sync route's stall-grace (`STALL_GRACE_HOURS = 3`) and central alerting — behind Caddy/Nginx, with automated **off-site encrypted backups** and uptime monitoring. Keep managed Postgres as an option under a self-hosted app layer if we want managed durability without full DIY.

Either way, replicate the cron's hard-won stall handling and add a **central alert on the sync's non-200 rate** — self-hosting removes Vercel's per-project `CRON_SECRET` silent-401 failure mode (`NATIONAL-SCALING.md` §2.5), but we must not lose the monitoring that caught it.

---

## 7. Phase-2 volunteer tools

These are member-facing, org-scoped (one river's volunteers see their river), built on the existing roles (`volunteer` enters, `admin` manages) and the patterns we already use (`winep_asset_links` manual linking, `imports` audit, the permit form's per-asset EIR reference). From the review: EIR tracking is **half-modelled** (the permit form already specifies "EIR reference + dates logged against each asset"), the casework/advocacy log and the investigations register are **explicitly "not yet modelled"** (`VOLUNTEER-DATA-AND-ACTIONS.md`, `SPILLS-FRAMING-LAYERS.md`), and **NIRS appears nowhere** — fully greenfield.

### 7.1 EIR request register — missing-data requests

Formalises the ad-hoc "EIR reference + dates per asset" into a first-class register.

`eir_requests`: `id`, `organisation_id`, `authority` (EA | water company | other), `subject` (what was asked), `scope` (free text + optional links to assets/works/water bodies), `status` (`planned | sent | acknowledged | received | entered | partially_refused | refused | overdue`), `date_sent`, `date_due` (auto = sent + 20 working days), `date_received`, `reference` (e.g. `EIR26291`), `documents` (Storage links), `data_entered` (bool + what), `requested_by`, `notes`.
- A **"needs an EIR" worklist** derived from data gaps (e.g. works with no permit, missing FFT/DWF), so the register is driven by what the data is missing.
- Status auto-flags **overdue** at 20 working days (the chase trigger from the volunteer actions doc).
- Links to the existing per-asset permit fields so a received EIR closes the gap it was raised for.

### 7.2 Casework / actions register — EIR requests and actions prompted by River Hub findings

The greenfield "advocacy / casework log." Records engagement triggered by what River Hub surfaced (dry-spill dossiers, gaps, capacity breaches) and what happened next.

`casework`: `id`, `organisation_id`, `trigger_type` (`dry_spill | gap | capacity | emergency_overflow | water_quality | other`) + `trigger_ref` (asset/event/gap id), `action_type` (`eir_followup | letter_company | letter_ea | letter_ofwat | letter_mp | letter_council | enforcement_submission | consultation_response | other`), `recipient`, `date`, `status` (`drafted | sent | responded | resolved | no_response`), `response_summary`, `outcome` / `action_taken`, `evidence` (links to dossiers/CSVs), `handled_by`.
- Cross-links to `eir_requests` where the action *is* an EIR (the "request made on the basis of River Hub data, e.g. following up a dry spill").
- Surfaces as a per-river **"what we've done about it"** timeline; aggregates into a national "citizen action" count for the summary page.

### 7.3 NIRS register

Greenfield. A register of **National Incident Reporting System** pollution reports relevant to a catchment.

`nirs_reports`: `id`, `organisation_id`, `nirs_reference`, `incident_date`, `reported_by` (company self-report | EA | public), `category` / `severity`, `location` (optional links to asset / water body + coords), `summary`, `documents` (Storage), `status`, `source_request` (optional FK to the `eir_requests` row that obtained it), `entered_by`.
- Where incidents coincide with a monitored overflow, link them so an asset page can show "a pollution incident was reported here."

### 7.4 Water-company / EA investigations register

Greenfield; `SPILLS-FRAMING-LAYERS.md` confirms we hold WINEP/SODRP but "no EA enforcement register or FoD casework log."

`investigations`: `id`, `organisation_id`, `authority` (EA | water company), `type` (`bathing_water | shellfish | soaf | enforcement | no_impact_assessment | other`), `subject` (links to assets / works / water body / bathing water), `status` (`open | reporting | completed | closed`), `date_opened`, `date_due`, `date_reported`, `outcome`, `documents`, `source_request` (optional FK to `eir_requests`), `entered_by`.
- **Cross-reference WINEP** — the `BW_INV*` driver actions in `winep_actions` are themselves investigations; link rather than duplicate, so the register is "investigations we know about," WINEP-sourced plus EIR-discovered.

**Common threads across all four:** one `documents` convention (private Storage bucket, RLS-scoped), a shared "linked to asset/works/water body" pattern, `volunteer` enters / `admin` manages, an audit of who entered what and when, and optional promotion of selected items to the public site later (gaps are already public; casework and investigations could follow).

---

## 8. Migration & rollout

1. **Consolidate schema** — the national DB is the same migration sequence; add the `rivers`/org-branding columns, the river-aware public RPCs, and the national aggregates as new migrations (append-only, org-guarded).
2. **Bring Dart + Teign into one database** — load both orgs into the national DB (they're already org-scoped and id-clean), move their branding onto their `organisations` rows, and point `data.friendsofthedart.org` / the Teign domain at the national app with their river slug (or keep vanity domains mapping to `/r/<slug>`).
3. **Live feed** — switch the cron to the national Storm Overflow Hub adapter (or registry-driven per-company), verify both rivers keep reporting, keep the EA Annual Return history path unchanged.
4. **Cutover** — run the national site in parallel, smoke-test both rivers' public pages against the existing ones, then redirect the old instances. Retire the two separate Vercel/Supabase projects once stable.
5. **Decommission check** — confirm the "apply full sequence → clean empty instance" property still holds and the private instance registry is updated/retired.

---

## 9. Phasing

1. **National core on cloud:** de-single-org the portal (river slugs + river-aware RPCs), runtime branding, the national live-feed adapter, national summary + chooser. Migrate Dart + Teign in. → any English SWW river can be added as data.
2. **Scale-out:** national onboarding pipeline, per-company matching + QA, materialised views / partitioning, central cron alerting. → the rest of England's companies.
3. **Volunteer tools:** EIR register, casework log, NIRS register, investigations register.
4. **Hosting migration (if/when triggered):** move to the self-host target per §6.3.
5. **Devolved nations:** Wales, then Scotland, then NI, as per-nation adapters.

---

## 10. Risks & open questions

The scope and architecture choices are settled (see **Decisions**, above). What remains are validation and build-time items, not blockers:

- **Live-feed validation:** confirm the Storm Overflow Hub's coverage and quality company-by-company during the build; add a per-company adapter wherever it falls short (the decision to use the Hub is made — this is verification).
- **Performance budget:** materialised-view refresh cadence, and whether `spill_events` partitioning is needed before or after the first non-SWW company.
- **Public exposure of Phase-2 tools:** which of casework / investigations / NIRS become public, and when (gaps are already public).
- **Cron schedule doc fix:** reconcile daily (`DEPLOY.md`) vs hourly (`PROVISIONING.md`, `PUBLIC-SITE-REDESIGN.md`) against `vercel.json`; hourly is the intent.
