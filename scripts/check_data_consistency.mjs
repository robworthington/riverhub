#!/usr/bin/env node
// River Hub — data-consistency checks.
//
// Exercises the PUBLIC RPCs the live site consumes and asserts the invariants that must hold across
// them, so a data or logic regression is caught without eyeballing every page. Run it periodically:
//
//   node scripts/check_data_consistency.mjs            # uses NEXT_PUBLIC_SUPABASE_* from .env.local
//   CHECK_SUPABASE_URL=… CHECK_SUPABASE_ANON_KEY=… node scripts/check_data_consistency.mjs
//
// Point it at PRODUCTION (that is where the real data lives). Exits non-zero if any check fails, so it
// can go straight onto a cron / CI job. It only reads through the anon RPCs — no writes, no secrets.
//
// The checks encode the reconciliations behind the public pages, plus guards for the two data bugs
// found in Sep 2026: stale-empty ISR renders (a core list coming back empty) and phantom "recent"
// badges (live status keying off a sub-15-minute blip instead of the last >=15-min spill).

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- env ----------
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();
const URL = process.env.CHECK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.CHECK_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase URL/anon key (CHECK_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(2);
}
const db = createClient(URL, KEY);

// ---------- helpers ----------
const HOUR = 3_600_000;
const RECENT_MS = 48 * HOUR;
const NOW = Date.now();
const ms = (iso) => (iso ? Date.parse(iso) : null);
const yearOf = (iso) => new Date(iso).getUTCFullYear();

async function rpc(name, args = {}) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db.rpc(name, args);
    if (!error && data != null) return data;
    lastErr = error;
    if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw new Error(`RPC ${name} failed: ${lastErr?.message ?? "null"}`);
}

// Sample a manageable set of assets to exercise per-asset RPCs: the live "recent" ones, the heaviest
// spillers, and a couple at random — enough to catch a systemic problem cheaply.
function sampleAssets(board, problems) {
  const ids = new Set();
  board.filter((r) => r.last_spill_end && NOW - ms(r.last_spill_end) <= RECENT_MS).forEach((r) => ids.add(r.asset_id));
  [...problems].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 6).forEach((r) => ids.add(r.asset_id));
  const rest = board.map((r) => r.asset_id).filter((id) => !ids.has(id));
  for (let i = 0; i < 3 && rest.length; i++) ids.add(rest.splice((Math.random() * rest.length) | 0, 1)[0]);
  return [...ids].slice(0, 15);
}

// ---------- check registry ----------
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || "ok" });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ==========================================================================================
async function run() {
  // Load the core lists once; most checks reuse them. Load defensively so a single down RPC shows up
  // as a failed check with the full report, rather than crashing the whole run.
  const safe = async (name, args) => {
    try { return await rpc(name, args); }
    catch (e) { results.push({ name: `load ${name}`, ok: false, detail: e.message }); return []; }
  };
  const [problems, works, measures, board, pins, reduction, repeat] = await Promise.all([
    safe("public_spills_problems"),
    safe("public_spills_works"),
    safe("public_spills_measures"),
    safe("public_spills_board", { p_year: null }),
    safe("public_spill_pins"),
    safe("public_spills_reduction"),
    safe("public_spills_repeat_offenders"),
  ]);

  // ---- Group 1: availability (stale-empty guard) ----
  await check("problems list is populated", () => (assert(problems.length > 0, "empty"), `${problems.length} overflows`));
  await check("works list is populated", () => (assert(works.length > 0, "empty"), `${works.length} works`));
  await check("measures list is populated", () => (assert(measures.length > 0, "empty"), `${measures.length} measures`));
  await check("board is populated", () => (assert(board.length > 0, "empty"), `${board.length} assets`));
  await check("map pins are populated", () => (assert(pins.length > 0, "empty"), `${pins.length} pins`));
  await check("reduction list is populated", () => (assert(reduction.length > 0, "empty"), `${reduction.length} tracked`));
  await check("repeat offenders list is populated", () => (assert(repeat.length > 0, "empty"), `${repeat.length} offenders`));

  // ---- Group 2: partitions / headline reconciliations ----
  await check("measures: active + complete = total", () => {
    const active = measures.filter((m) => !m.complete).length;
    const complete = measures.filter((m) => m.complete).length;
    assert(active + complete === measures.length, `active ${active} + complete ${complete} ≠ total ${measures.length}`);
    return `${measures.length} = ${active} active + ${complete} complete`;
  });

  await check("reduction: over-cap + within-cap = total, verdicts valid", () => {
    const over = reduction.filter((r) => r.latest > 10).length;
    const within = reduction.filter((r) => r.latest <= 10).length;
    assert(over + within === reduction.length, `over ${over} + within ${within} ≠ ${reduction.length}`);
    const bad = reduction.filter((r) => !["within", "rising", "falling"].includes(r.verdict));
    assert(bad.length === 0, `${bad.length} rows with an unexpected verdict`);
    const chip = reduction.filter((r) => r.verdict === "within").length;
    assert(chip === within, `"within" verdict count ${chip} ≠ latest≤10 count ${within}`);
    return `${reduction.length} = ${over} over + ${within} within; verdict "within" ties to latest≤10`;
  });

  await check("works: verdicts are exhaustive and partition the total", () => {
    const kinds = ["over", "limit", "within", "not_assessed"];
    const bad = works.filter((w) => !kinds.includes(w.verdict));
    assert(bad.length === 0, `${bad.length} works with an unexpected verdict`);
    const sum = kinds.reduce((s, k) => s + works.filter((w) => w.verdict === k).length, 0);
    assert(sum === works.length, `verdict counts sum ${sum} ≠ ${works.length}`);
    const over = works.filter((w) => w.verdict === "over").length;
    return `${works.length} works; ${over} over permitted flow`;
  });

  await check("gaps: derivable, and a subset of flagged ⊆ tracked", () => {
    assert(problems.every((r) => typeof r.weight === "number" && typeof r.has_action === "boolean"), "problems missing weight/has_action");
    const flagged = problems.filter((r) => r.weight > 0);
    const gaps = flagged.filter((r) => !r.has_action);
    assert(gaps.length <= flagged.length && flagged.length <= problems.length, "gaps ⊄ flagged ⊄ tracked");
    return `${gaps.length} gaps of ${flagged.length} flagged, ${problems.length} tracked`;
  });

  // ---- Group 3: cross-RPC agreement ----
  await check("board dry-count agrees with problems dry-count per asset", () => {
    const pByAsset = new Map(problems.map((p) => [p.asset_id, p.dry]));
    const mismatches = board.filter((b) => pByAsset.has(b.asset_id) && (pByAsset.get(b.asset_id) ?? 0) !== (b.dry ?? 0));
    assert(mismatches.length === 0, `${mismatches.length} assets where board.dry ≠ problems.dry (e.g. ${mismatches[0]?.asset_name})`);
    return `${[...pByAsset].length} assets cross-checked`;
  });

  await check("map pins agree with the board (status + last_spill_end)", () => {
    const byAsset = new Map(board.map((b) => [b.asset_id, b]));
    const orphans = pins.filter((p) => !byAsset.has(p.asset_id));
    assert(orphans.length === 0, `${orphans.length} pins not on the board`);
    const disagree = pins.filter((p) => {
      const b = byAsset.get(p.asset_id);
      return (p.status ?? null) !== (b.status ?? null) || (p.last_spill_end ?? null) !== (b.last_spill_end ?? null);
    });
    assert(disagree.length === 0, `${disagree.length} pins disagree with the board (e.g. ${disagree[0]?.asset_name})`);
    return `${pins.length} pins consistent with the board`;
  });

  await check("repeat offenders are all tracked with dry spills", () => {
    const dryByAsset = new Map(problems.map((p) => [p.asset_id, p.dry ?? 0]));
    const bad = repeat.filter((r) => !dryByAsset.has(r.asset_id) || dryByAsset.get(r.asset_id) <= 0);
    assert(bad.length === 0, `${bad.length} repeat offenders missing from problems or with dry=0 (e.g. ${bad[0]?.asset_name})`);
    return `${repeat.length} offenders all present with dry>0`;
  });

  await check("emergency overflows: summary count = list length", async () => {
    const [eo, sum] = await Promise.all([rpc("public_emergency_overflows"), rpc("public_eo_summary")]);
    if (eo.length === 0) return "no EO data (legitimately empty) — skipped";
    const count = sum[0]?.eo_count ?? sum.length;
    assert(count === eo.length, `summary count ${count} ≠ list length ${eo.length}`);
    return `${eo.length} emergency overflows`;
  });

  // ---- Group 4: live-status 15-minute floor (phantom-recent guard) ----
  const sample = sampleAssets(board, problems);

  await check("live status: 'recent' is backed by a ≥15-min spill (no phantom badges)", async () => {
    const boardById = new Map(board.map((b) => [b.asset_id, b]));
    const offenders = [];
    let checked = 0;
    for (const id of sample) {
      const b = boardById.get(id);
      if (!b?.last_spill_end) continue;
      checked++;
      const yr = yearOf(b.last_spill_end);
      // public_spill_events buckets by event_start year, so a spill that ended in yr may have started
      // in yr-1 — fetch both. Its end must appear among the ≥15-min events the RPC returns (which is
      // the anti-phantom guard: a sub-15-min blip would be excluded and so could never set this field).
      const events = [
        ...(await rpc("public_spill_events", { p_asset: id, p_year: yr })),
        ...(await rpc("public_spill_events", { p_asset: id, p_year: yr - 1 })),
      ];
      const ends = new Set(events.map((e) => ms(e.event_end)).filter((t) => t != null));
      if (!ends.has(ms(b.last_spill_end))) {
        offenders.push(`${b.asset_name}: last_spill_end ${b.last_spill_end} not matched by any ≥15-min event in ${yr}/${yr - 1}`);
      }
    }
    assert(offenders.length === 0, offenders.join(" | "));
    return `${checked} assets with a last_spill_end: each traces to a ≥15-min spill`;
  });

  await check("event RPCs honour the 15-minute floor (main ≥15, brief 1–14, no overlap)", async () => {
    const yr = new Date().getUTCFullYear();
    const problemsSample = sample.slice(0, 8);
    const bad = [];
    for (const id of problemsSample) {
      const [main, brief] = await Promise.all([
        rpc("public_spill_events", { p_asset: id, p_year: yr }),
        rpc("public_spill_brief", { p_asset: id, p_year: yr }),
      ]);
      if (main.some((e) => e.duration_minutes != null && e.duration_minutes < 15)) bad.push(`${id}: main view has a <15-min event`);
      if (brief.some((e) => e.duration_minutes == null || e.duration_minutes < 1 || e.duration_minutes >= 15)) bad.push(`${id}: brief view has an out-of-range event`);
    }
    assert(bad.length === 0, bad.join(" | "));
    return `${problemsSample.length} assets: main ≥15 min, brief 1–14 min, disjoint`;
  });

  await check("asset detail agrees with the board (status + last_spill_end)", async () => {
    const boardById = new Map(board.map((b) => [b.asset_id, b]));
    const bad = [];
    for (const id of sample.slice(0, 8)) {
      const b = boardById.get(id);
      const hdr = (await rpc("public_spill_asset", { p_asset: id }))[0];
      if (!hdr) { bad.push(`${id}: no asset-detail row`); continue; }
      if ((hdr.status ?? null) !== (b.status ?? null)) bad.push(`${b.asset_name}: status ${hdr.status} ≠ board ${b.status}`);
      if ((hdr.last_spill_end ?? null) !== (b.last_spill_end ?? null)) bad.push(`${b.asset_name}: last_spill_end differs from board`);
    }
    assert(bad.length === 0, bad.join(" | "));
    return `${Math.min(8, sample.length)} assets: detail matches board`;
  });

  // ---- Reported metric (not a failure): the phantom-recent set the fix now suppresses ----
  const rawRecent = board.filter((b) => b.status !== 1 && b.latest_event_end && NOW - ms(b.latest_event_end) <= RECENT_MS);
  const floorRecent = board.filter((b) => b.status !== 1 && b.last_spill_end && NOW - ms(b.last_spill_end) <= RECENT_MS);
  const suppressed = rawRecent.filter((b) => !floorRecent.some((f) => f.asset_id === b.asset_id));
  results.push({
    name: "metric: brief-only 'recent' outlets suppressed by the 15-min floor",
    ok: true,
    detail: `${suppressed.length} outlet(s) would look 'recent' from raw latest_event_end but have no ≥15-min spill in 48h (correctly not shown)`,
  });
}

// ---------- report ----------
run()
  .then(() => {
    const fails = results.filter((r) => !r.ok);
    console.log(`\nRiver Hub data consistency — ${URL}\n`);
    for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);
    console.log(`\n${results.length - fails.length}/${results.length} passed${fails.length ? ` — ${fails.length} FAILED` : ""}.\n`);
    process.exit(fails.length ? 1 : 0);
  })
  .catch((e) => {
    console.error("Runner crashed:", e.message);
    process.exit(2);
  });
