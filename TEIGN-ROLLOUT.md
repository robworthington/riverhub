# Teign rollout — migrations 0057–0069

Bring the **Friends of the River Teign** instance up to the same public spills feature set as Dart:
the four-question IA, the framing/regulatory sections (why / measures / gaps / calendar / method),
the reduction tracker, evidence dossiers, and the members measure-linking.

**The code is already deployed to Teign** (both instances build from `main`). What Teign is missing is
the **database side** — these RPCs/tables aren't applied to Teign's Supabase yet, so the new public
pages currently render empty. This checklist applies them.

All SQL runs in **Teign's Supabase → SQL Editor** (a direct connection — needed for the schema reload).
Teign runs all its own prod SQL; nothing here touches Dart.

---

## 0. Pre-flight — confirm Teign is current through 0056

0057+ depend on the public-spills baseline (0048–0056). Teign has had migration-state drift before, so
check first. Run:

```sql
select
  to_regprocedure('public.classify_spills_yearly(uuid,int,numeric)')      as m0048,
  to_regprocedure('public.dry_spill_summary(int,numeric,int,int)')        as m0031_minmin,
  to_regprocedure('public.public_spill_year_range()')                     as m0055,
  to_regprocedure('public.public_spills_board(int)')                      as m0050_56,
  to_regclass('public.protected_areas')                                   as protected_areas,
  to_regclass('public.winep_actions')                                     as winep_actions;
```

Every column must be **non-null**. If any is null, apply the missing earlier migration(s) first
(see `supabase/migrations/MANIFEST.md` for the ordered list) — do **not** start 0057 until this passes.
In particular `m0048` and `m0031_minmin` being null means the 15-minute-minimum baseline is missing and
0065's problem logic won't behave.

---

## 1. Apply 0057–0069 in order

Paste each file's full contents into the SQL editor and run, **in numeric order**. They are
self-contained (the drop-and-recreate ones include their own `drop` + `grant`). Don't skip any — a few
are superseded by later ones (0063 by 0065; 0066 and 0068 by 0069), but applying all in order leaves
Teign's schema identical to Dart's and keeps the migration history consistent.

| # | File | What it adds | Note |
|---|------|--------------|------|
| 0057 | repeat_offenders | `public_spills_repeat_offenders()` | plain |
| 0058 | public_spill_evidence | evidence dossier RPC; **adds `event_id`** to the event-log/flagged RPCs | drops + recreates two RPCs (in-file) |
| 0059 | spills_framing_foundation | **`winep_asset_links` table** + RLS; `public_spills_works()`; `public_spills_latest_full_year()` | new table |
| 0060 | public_spills_problems | `public_spills_problems()`, `public_spills_measures_for_asset()` | plain |
| 0061 | public_spill_heartbeat | `public_spill_heartbeat()` | plain |
| 0062 | feed_health_from_captured_at | redefines `public_spills_board` / `public_spill_asset` (feed age from our poll time) | plain |
| 0063 | public_spills_measures | `public_spills_measures()` | superseded by 0065 |
| 0064 | per_asset_scoped_rpcs | `public_spills_problem_for_asset()`, `public_spills_works_for_system()` | plain |
| 0065 | measures_refinements | measures RPCs gain description/complete; `has_action` = active only; STW excluded from pre-STW | drops + recreates two RPCs (in-file) |
| 0066 | public_spills_reduction | `public_spills_reduction()` (PostGIS deadline) | superseded by 0069 |
| 0067 | protected_areas_geog_index | geography GiST index | index only |
| 0068 | reduction_cheap_deadline | reduction RPC without PostGIS | superseded by 0069 |
| 0069 | cache_sodrp_deadline | **adds `sewage_assets.sodrp_deadline`** + backfills it once + final reduction RPC | runs a one-time backfill |

**0069's backfill** computes the SODRP deadline per asset via PostGIS. It runs as the privileged SQL-
editor role, so the cost is fine — but it's only accurate if Teign's `protected_areas` is populated
(see step 3). If it's empty, every asset backfills to `2050`, which is a safe default.

## 2. Reload the PostgREST schema cache — once, at the end

```sql
notify pgrst, 'reload schema';
```

(One reload after all the migrations is enough — the anon public site reaches these RPCs through
PostgREST, which needs this to see the new functions.)

## 3. Redeploy Teign so the static pages re-render

The new public pages (`/why`, `/measures`, `/gaps`, `/calendar`, `/method`, `/reduction`) are
ISR-prerendered at build. Teign's current build prerendered them **before** these RPCs existed, so they
cached empty. Trigger a **Vercel redeploy of Teign** (Deployments → latest Production → Redeploy) so
they re-render against the now-present RPCs. (Otherwise they self-heal on the next hourly revalidation.)

---

## 4. Sanity checks (Teign SQL editor)

```sql
select count(*) from public_spills_problems();            -- per-asset rows
select count(*) from public_spills_works();               -- one row per works
select count(*) from public_spills_measures();            -- WINEP register (0 if no WINEP import — see below)
select count(*) from public_spills_reduction();           -- reduction rows
select deadline, count(*) from public_spills_reduction() group by deadline;  -- 2050-heavy if no protected_areas
select count(*) from winep_asset_links;                   -- 0 (Teign has no links yet)
```

## 5. Teign-specific expectations (sparser data than Dart)

- **WINEP measures** — the `/measures` and `/gaps` pages depend on `winep_actions`. If Teign has no
  WINEP import, the register is empty and **every flagged overflow is a gap** (honest, but bare). A
  Teign WINEP import + its own measure→asset linking is a separate follow-up — the Dart links were
  Dart-specific and are **not** carried over.
- **Protected areas / SODRP deadlines** — if `protected_areas` isn't loaded for the Teign org, the
  reduction tracker's deadlines all read `2050` and the `/why/capacity` priority context is thin.
  Loading them (`import_ogc_areas.py` / the protected-areas pipeline) then re-running 0069's backfill
  fixes it.
- **Permits / capacity** — `/why/capacity` reads `asset_permits` + `system_capacity_v`; where Teign's
  permit/population data is sparse, more works show **"not assessed"** (by design, not a bug).
- **Bathing-water strip** — not built on either instance yet; no Teign action needed.

## 6. Verify on the live site

`riverhub.friendsoftheriverteign.org/explore/spills` → the four-question nav; then spot-check:
- `/why` — three indicators with real counts
- `/gaps` — a gap headline
- `/reduction` — the trajectory board populates (Totnes-equivalent worst overflow at the top)
- an asset page — "Can its works cope?", "Is anyone acting?", the heartbeat strip

If `/reduction` is empty after the redeploy, it's the same build-prerender timing as Dart hit — confirm
0069 is applied and reload the schema, then redeploy once more.
