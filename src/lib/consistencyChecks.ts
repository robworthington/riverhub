// River Hub — data-consistency checks (canonical).
//
// Exercises the public RPCs the live site consumes and asserts the invariants behind the pages, so a
// data or logic regression is caught without eyeballing every page. Pure and client-injected: the
// Vercel cron (src/app/api/cron/data-check) runs it against the anon client on a schedule, and the CLI
// (scripts/check_data_consistency.mjs) hits that same route. Read-only — only public_* RPCs.
//
// The checks encode the page reconciliations plus guards for the two data bugs found in Sep 2026:
// stale-empty ISR renders (a core list coming back empty) and phantom "recent" badges (live status
// keying off a sub-15-minute blip instead of the last >=15-min spill).

import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckResult = { name: string; ok: boolean; detail: string };
type Row = Record<string, unknown>;

const HOUR = 3_600_000;
const RECENT_MS = 48 * HOUR;
const ms = (iso: unknown): number | null => (typeof iso === "string" ? Date.parse(iso) : null);
const yearOf = (iso: string): number => new Date(iso).getUTCFullYear();

async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<Row[]> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db.rpc(name as never, args as never);
    if (!error && data != null) return data as Row[];
    lastErr = error;
    if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw new Error(`RPC ${name} failed: ${(lastErr as { message?: string })?.message ?? "null"}`);
}

// A manageable sample for the per-asset RPCs: the live "recent" outlets, the heaviest spillers, and a
// couple at random — enough to catch a systemic problem cheaply.
function sampleAssets(board: Row[], problems: Row[], now: number, n = 10): string[] {
  const ids = new Set<string>();
  board
    .filter((r) => r.last_spill_end && now - (ms(r.last_spill_end) ?? 0) <= RECENT_MS)
    .forEach((r) => ids.add(r.asset_id as string));
  [...problems].sort((a, b) => ((b.weight as number) ?? 0) - ((a.weight as number) ?? 0)).slice(0, 5).forEach((r) => ids.add(r.asset_id as string));
  const rest = board.map((r) => r.asset_id as string).filter((id) => !ids.has(id));
  for (let i = 0; i < 3 && rest.length; i++) ids.add(rest.splice((Math.random() * rest.length) | 0, 1)[0]);
  return [...ids].slice(0, n);
}

export async function runConsistencyChecks(
  db: SupabaseClient,
  now: number = Date.now(),
): Promise<{ results: CheckResult[]; passed: number; failed: number }> {
  const results: CheckResult[] = [];
  const check = async (name: string, fn: () => Promise<string | void> | string | void) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail || "ok" });
    } catch (e) {
      results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };
  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  // Load the core lists once (defensively, so one down RPC is a failed check, not a crash).
  const safe = async (name: string, args?: Record<string, unknown>) => {
    try { return await rpc(db, name, args); }
    catch (e) { results.push({ name: `load ${name}`, ok: false, detail: e instanceof Error ? e.message : String(e) }); return [] as Row[]; }
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
  await check("problems list is populated", () => { assert(problems.length > 0, "empty"); return `${problems.length} overflows`; });
  await check("works list is populated", () => { assert(works.length > 0, "empty"); return `${works.length} works`; });
  await check("measures list is populated", () => { assert(measures.length > 0, "empty"); return `${measures.length} measures`; });
  await check("board is populated", () => { assert(board.length > 0, "empty"); return `${board.length} assets`; });
  await check("map pins are populated", () => { assert(pins.length > 0, "empty"); return `${pins.length} pins`; });
  await check("reduction list is populated", () => { assert(reduction.length > 0, "empty"); return `${reduction.length} tracked`; });
  await check("repeat offenders list is populated", () => { assert(repeat.length > 0, "empty"); return `${repeat.length} offenders`; });

  // ---- Group 2: partitions / headline reconciliations ----
  await check("measures: active + complete = total", () => {
    const active = measures.filter((m) => !m.complete).length;
    const complete = measures.filter((m) => m.complete).length;
    assert(active + complete === measures.length, `active ${active} + complete ${complete} ≠ total ${measures.length}`);
    return `${measures.length} = ${active} active + ${complete} complete`;
  });

  await check("reduction: over-cap + within-cap = total, verdicts valid", () => {
    const over = reduction.filter((r) => (r.latest as number) > 10).length;
    const within = reduction.filter((r) => (r.latest as number) <= 10).length;
    assert(over + within === reduction.length, `over ${over} + within ${within} ≠ ${reduction.length}`);
    assert(reduction.every((r) => ["within", "rising", "falling"].includes(r.verdict as string)), "unexpected verdict value");
    const chip = reduction.filter((r) => r.verdict === "within").length;
    assert(chip === within, `"within" verdict count ${chip} ≠ latest≤10 count ${within}`);
    return `${reduction.length} = ${over} over + ${within} within; verdict "within" ties to latest≤10`;
  });

  await check("works: verdicts are exhaustive and partition the total", () => {
    const kinds = ["over", "limit", "within", "not_assessed"];
    assert(works.every((w) => kinds.includes(w.verdict as string)), "unexpected works verdict");
    const sum = kinds.reduce((s, k) => s + works.filter((w) => w.verdict === k).length, 0);
    assert(sum === works.length, `verdict counts sum ${sum} ≠ ${works.length}`);
    return `${works.length} works; ${works.filter((w) => w.verdict === "over").length} over permitted flow`;
  });

  await check("gaps: derivable, and flagged ⊆ tracked", () => {
    assert(problems.every((r) => typeof r.weight === "number" && typeof r.has_action === "boolean"), "problems missing weight/has_action");
    const flagged = problems.filter((r) => (r.weight as number) > 0);
    const gaps = flagged.filter((r) => !r.has_action);
    assert(gaps.length <= flagged.length && flagged.length <= problems.length, "gaps ⊄ flagged ⊄ tracked");
    return `${gaps.length} gaps of ${flagged.length} flagged, ${problems.length} tracked`;
  });

  // ---- Group 3: cross-RPC agreement ----
  await check("board dry-count agrees with problems dry-count per asset", () => {
    const pByAsset = new Map(problems.map((p) => [p.asset_id, p.dry]));
    const mismatches = board.filter((b) => pByAsset.has(b.asset_id) && ((pByAsset.get(b.asset_id) as number) ?? 0) !== ((b.dry as number) ?? 0));
    assert(mismatches.length === 0, `${mismatches.length} assets where board.dry ≠ problems.dry (e.g. ${mismatches[0]?.asset_name})`);
    return `${pByAsset.size} assets cross-checked`;
  });

  await check("map pins agree with the board (status + last_spill_end)", () => {
    const byAsset = new Map(board.map((b) => [b.asset_id, b]));
    const orphans = pins.filter((p) => !byAsset.has(p.asset_id));
    assert(orphans.length === 0, `${orphans.length} pins not on the board`);
    const disagree = pins.filter((p) => {
      const b = byAsset.get(p.asset_id)!;
      return (p.status ?? null) !== (b.status ?? null) || (p.last_spill_end ?? null) !== (b.last_spill_end ?? null);
    });
    assert(disagree.length === 0, `${disagree.length} pins disagree with the board (e.g. ${disagree[0]?.asset_name})`);
    return `${pins.length} pins consistent with the board`;
  });

  await check("repeat offenders are all tracked with dry spills", () => {
    const dryByAsset = new Map(problems.map((p) => [p.asset_id, (p.dry as number) ?? 0]));
    const bad = repeat.filter((r) => !dryByAsset.has(r.asset_id) || (dryByAsset.get(r.asset_id) as number) <= 0);
    assert(bad.length === 0, `${bad.length} repeat offenders missing from problems or with dry=0 (e.g. ${bad[0]?.asset_name})`);
    return `${repeat.length} offenders all present with dry>0`;
  });

  await check("emergency overflows: summary count = list length", async () => {
    const [eo, sum] = await Promise.all([rpc(db, "public_emergency_overflows"), rpc(db, "public_eo_summary")]);
    if (eo.length === 0) return "no EO data (legitimately empty) — skipped";
    const count = (sum[0]?.eo_count as number) ?? sum.length;
    assert(count === eo.length, `summary count ${count} ≠ list length ${eo.length}`);
    return `${eo.length} emergency overflows`;
  });

  // ---- Group 4: live-status 15-minute floor (phantom-recent guard) ----
  const sample = sampleAssets(board, problems, now);
  const boardById = new Map(board.map((b) => [b.asset_id, b]));

  await check("live status: 'recent' is backed by a ≥15-min spill (no phantom badges)", async () => {
    const withEnd = sample.filter((id) => boardById.get(id)?.last_spill_end);
    const offenders = (
      await Promise.all(
        withEnd.map(async (id) => {
          const b = boardById.get(id)!;
          const yr = yearOf(b.last_spill_end as string);
          // public_spill_events buckets by event_start year, so a spill that ended in yr may have
          // started in yr-1 — fetch both. A sub-15-min blip is excluded by that RPC and so could never
          // set last_spill_end, which is the phantom-recent guard.
          const events = [
            ...(await rpc(db, "public_spill_events", { p_asset: id, p_year: yr })),
            ...(await rpc(db, "public_spill_events", { p_asset: id, p_year: yr - 1 })),
          ];
          const target = ms(b.last_spill_end);
          const ends = new Set(events.map((e) => ms(e.event_end)).filter((t): t is number => t != null));
          return target != null && ends.has(target) ? null : `${b.asset_name}: last_spill_end ${b.last_spill_end} not matched by a ≥15-min event`;
        }),
      )
    ).filter(Boolean);
    assert(offenders.length === 0, offenders.join(" | "));
    return `${withEnd.length} assets with a last_spill_end: each traces to a ≥15-min spill`;
  });

  await check("event RPCs honour the 15-minute floor (main ≥15, brief 1–14, no overlap)", async () => {
    const yr = new Date(now).getUTCFullYear();
    const bad = (
      await Promise.all(
        sample.slice(0, 8).map(async (id) => {
          const [main, brief] = await Promise.all([
            rpc(db, "public_spill_events", { p_asset: id, p_year: yr }),
            rpc(db, "public_spill_brief", { p_asset: id, p_year: yr }),
          ]);
          if (main.some((e) => e.duration_minutes != null && (e.duration_minutes as number) < 15)) return `${id}: main view has a <15-min event`;
          if (brief.some((e) => e.duration_minutes == null || (e.duration_minutes as number) < 1 || (e.duration_minutes as number) >= 15)) return `${id}: brief view has an out-of-range event`;
          return null;
        }),
      )
    ).filter(Boolean);
    assert(bad.length === 0, bad.join(" | "));
    return `${Math.min(8, sample.length)} assets: main ≥15 min, brief 1–14 min, disjoint`;
  });

  await check("asset detail agrees with the board (status + last_spill_end)", async () => {
    const bad = (
      await Promise.all(
        sample.slice(0, 8).map(async (id) => {
          const b = boardById.get(id)!;
          const hdr = (await rpc(db, "public_spill_asset", { p_asset: id }))[0];
          if (!hdr) return `${id}: no asset-detail row`;
          if ((hdr.status ?? null) !== (b.status ?? null)) return `${b.asset_name}: status ${hdr.status} ≠ board ${b.status}`;
          if ((hdr.last_spill_end ?? null) !== (b.last_spill_end ?? null)) return `${b.asset_name}: last_spill_end differs from board`;
          return null;
        }),
      )
    ).filter(Boolean);
    assert(bad.length === 0, bad.join(" | "));
    return `${Math.min(8, sample.length)} assets: detail matches board`;
  });

  // ---- Reported metric (not a failure): the phantom-recent set the floor now suppresses ----
  const rawRecent = board.filter((b) => b.status !== 1 && b.latest_event_end && now - (ms(b.latest_event_end) ?? 0) <= RECENT_MS);
  const floorRecent = new Set(board.filter((b) => b.status !== 1 && b.last_spill_end && now - (ms(b.last_spill_end) ?? 0) <= RECENT_MS).map((b) => b.asset_id));
  const suppressed = rawRecent.filter((b) => !floorRecent.has(b.asset_id)).length;
  results.push({
    name: "metric: brief-only 'recent' outlets suppressed by the 15-min floor",
    ok: true,
    detail: `${suppressed} outlet(s) would look 'recent' from raw latest_event_end but have no ≥15-min spill in 48h (correctly not shown)`,
  });

  // ---- Group 5: sync-pipeline health + silent-feed guard ----
  // last_updated is our poll time (captured_at) per migration 0062/0077. It goes stale only when SWW
  // stops serving an outlet or our sync stops — so it is the right signal for both a whole-sync stall
  // and an individual feed dropping out. (SWW's own timestamp is NOT a freshness signal — it only bumps
  // on a status change — which is why this must not key off it.)
  const STALL_HOURS = 3; // hourly poll + slack — the freshest poll older than this means the ingest stalled
  const QUIET_HOURS = 6; // an outlet not polled this long while others are fresh = SWW dropped it (or a per-asset write fail)
  const DEAD_HOURS = 24; // beyond this the site already shows "No data" — a known gap, reported not re-alerted

  await check("live feeds are fresh (no sync stall or newly-silent feeds)", () => {
    const ages = board
      .map((b) => ({ name: (b.asset_name as string) ?? "?", code: (b.asset_code as string | null) ?? null, t: ms(b.last_updated) }))
      .filter((a): a is { name: string; code: string | null; t: number } => a.t != null);
    assert(ages.length > 0, "no feed timestamps on the board — the sync may never have run");
    const newestAgeH = (now - Math.max(...ages.map((a) => a.t))) / HOUR;
    // 1) whole-sync stall: even the freshest poll is old → our sync (or one org's) has stopped.
    assert(newestAgeH <= STALL_HOURS, `sync stall: freshest poll is ${newestAgeH.toFixed(1)}h ago (> ${STALL_HOURS}h) — the hourly ingest is not landing`);
    // 2) individual outlets we've stopped getting records for while the board is otherwise fresh.
    const quiet = ages
      .filter((a) => { const h = (now - a.t) / HOUR; return h > QUIET_HOURS && h <= DEAD_HOURS; })
      .sort((x, y) => x.t - y.t)
      .map((a) => `${a.name}${a.code ? ` (${a.code})` : ""} ${((now - a.t) / HOUR).toFixed(1)}h`);
    assert(quiet.length === 0, `${quiet.length} feed(s) gone quiet ${QUIET_HOURS}–${DEAD_HOURS}h: ${quiet.slice(0, 8).join(", ")}${quiet.length > 8 ? " …" : ""}`);
    return `${ages.length} feeds; freshest poll ${newestAgeH.toFixed(1)}h ago, none newly silent`;
  });

  // Metric (not a failure): feeds offline beyond the "No data" threshold — a known, already-surfaced gap.
  const offline = board
    .map((b) => ({ name: (b.asset_name as string) ?? "?", t: ms(b.last_updated) }))
    .filter((a) => a.t != null && (now - (a.t as number)) / HOUR > DEAD_HOURS);
  results.push({
    name: "metric: feeds offline > 24h (shown as 'No data')",
    ok: true,
    detail: offline.length ? `${offline.length}: ${offline.slice(0, 8).map((a) => a.name).join(", ")}${offline.length > 8 ? " …" : ""}` : "none",
  });

  const failed = results.filter((r) => !r.ok).length;
  return { results, passed: results.length - failed, failed };
}
