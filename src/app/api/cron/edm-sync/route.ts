import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { syncFleetEdm, type SyncSummary } from "@/lib/edm/sync";
import { syncOrgEa } from "@/lib/ea/sync";

export const dynamic = "force-dynamic";
// Each org does several ArcGIS + EA fetches. Running every org SEQUENTIALLY no longer fits the 60s cap
// now that the national DB holds ~29 orgs: a run gets through ~16 then is killed mid-loop, so the tail
// rivers go stale and the consistently-last org never syncs at all. We now sync orgs through a bounded
// CONCURRENCY pool, which keeps the whole run well under the cap while bounding concurrent upstream load.
export const maxDuration = 60;

// EDM is synced for the whole fleet in one pass: each company's live feed is fetched once and shared
// between its rivers (syncFleetEdm), so the hourly cost is ~one request per company, not per river.
// EA rainfall/flow (30 days per gauge) is slower and only needs refreshing about daily, so each hourly
// run syncs EA for the least-recently-synced rivers until EA_BUDGET_MS is used, a few at a time.
// At 30 rivers every river is refreshed most hours; at 340 the fleet is still covered through the day.
const EA_CONCURRENCY = 5;
const EA_BUDGET_MS = 35_000;

// Snapshot pruning (migration 0111) runs once a day, in this UTC hour, or on demand with ?prune=1.
const PRUNE_HOUR_UTC = 3;
const PRUNE_KEEP_DAYS = 7;

// Run `worker` over `items` with at most `concurrency` in flight, stopping new work once `deadline`
// (epoch ms) has passed. JS is single-threaded, so the shared aggregates the workers mutate are safe.
async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>, deadline = Infinity): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (Date.now() < deadline) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

// A single stalled run (0 snapshots, e.g. a brief ArcGIS/DB blip) must NOT return 5xx: Vercel
// disables a cron job after repeated failed runs, so one bad hour could switch the whole sync off
// (this is how the Teign cron ended up disabled). Only escalate to 5xx once an org has had no fresh
// snapshot for this long — a sustained outage worth a red run and an alert.
const STALL_GRACE_HOURS = 3;
const STALL_GRACE_MS = STALL_GRACE_HOURS * 3_600_000;

// Hourly ingestion (EDM live status for every river; EA rainfall/flow for a rotating set). Triggered by Vercel Cron
// (see vercel.json) with `Authorization: Bearer ${CRON_SECRET}`. Runs for every org by default; pass
// `?slug=<river_slug>` to sync a single river on demand (targeted re-sync / backfilling a new river).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  // Optional single-river scope. Lets us sync one river without waiting out (or timing out) the whole
  // fleet — the fix for a river the full run never reaches, and a handle for targeted re-syncs.
  const slug = request.nextUrl.searchParams.get("slug")?.trim() || null;

  const started = Date.now();
  let orgQuery = db.from("organisations").select("id, ea_synced_at" as "id");
  if (slug) orgQuery = orgQuery.eq("river_slug", slug);
  const { data: orgRows, error } = await orgQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const orgs = (orgRows ?? []) as unknown as { id: string; ea_synced_at: string | null }[];
  if (slug && orgs.length === 0) {
    return NextResponse.json({ error: `no organisation with river_slug '${slug}'` }, { status: 404 });
  }

  const results: Record<string, { edm?: SyncSummary; ea?: unknown }> = {};
  let totalSnapshots = 0;
  const errors: string[] = [];

  // --- EDM: the whole fleet (or the one river) in one pass ---
  try {
    const edmByOrg = await syncFleetEdm(db, nowIso, slug ? orgs.map((o) => o.id) : undefined);
    for (const [orgId, edm] of edmByOrg) {
      results[orgId] = { edm };
      totalSnapshots += edm.snapshotsWritten;
      if (edm.errors.length) errors.push(...edm.errors.map((e) => `${orgId} edm: ${e}`));
      // A healthy run writes one snapshot per monitored asset, so 0 from a non-empty asset list is a stall.
      if (edm.assetsChecked > 0 && edm.snapshotsWritten === 0) {
        console.warn(`[edm-sync] org ${orgId}: 0 snapshots from ${edm.assetsChecked} assets — feed fetch or match failed`);
      }
    }
  } catch (e) {
    errors.push(`edm: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- EA rainfall/flow: least-recently-synced rivers first, within the time budget ---
  const eaOrder = [...orgs].sort((a, b) => (a.ea_synced_at ?? "").localeCompare(b.ea_synced_at ?? ""));
  let eaSynced = 0;
  await mapPool(eaOrder, EA_CONCURRENCY, async (org) => {
    const ea = await syncOrgEa(db, org.id, fromDate);
    results[org.id] = { ...(results[org.id] ?? {}), ea };
    eaSynced++;
    await db.from("organisations").update({ ea_synced_at: new Date().toISOString() } as never).eq("id", org.id);
  }, slug ? Infinity : started + EA_BUDGET_MS);

  // --- daily snapshot pruning ---
  let pruned: number | null = null;
  if (!slug && (new Date().getUTCHours() === PRUNE_HOUR_UTC || request.nextUrl.searchParams.get("prune") === "1")) {
    const { data: n, error: pruneErr } = await db.rpc("prune_edm_snapshots" as never, { p_keep_days: PRUNE_KEEP_DAYS } as never);
    if (pruneErr) errors.push(`prune: ${pruneErr.message}`);
    else pruned = (n as unknown as number) ?? 0;
  }

  // Recompute the national rollup table that national_summary()/national_rivers() read. Those RPCs used
  // to run a per-org lateral over every live org on each call (~29s at 29 rivers → the national summary
  // page timed out and rendered empty); they now read this precomputed table, refreshed here after the
  // sync so the summary reflects the freshest data. Best-effort — a refresh failure must not fail the run.
  let rollupRefreshed = false;
  try {
    const { error: rollupErr } = await db.rpc("refresh_national_rollup");
    if (rollupErr) errors.push(`rollup refresh: ${rollupErr.message}`);
    else rollupRefreshed = true;
  } catch (e) {
    errors.push(`rollup refresh: ${e instanceof Error ? e.message : String(e)}`);
  }

  const payload = { ranAt: new Date().toISOString(), today, slug, orgs: orgs.length, totalSnapshots, eaSynced, pruned, rollupRefreshed, ms: Date.now() - started, errors, results };

  // The public board/asset pages read through cachedRpc, tagged "public-rpc" (see src/lib/publicData.ts).
  // When the sync writes new snapshots, drop those caches so the live board reflects the fresh data at
  // once, instead of waiting out each view's revalidate window (which left the default view showing a
  // stale "feeds not reporting" state for up to an hour after a fix).
  if (totalSnapshots > 0) {
    revalidateTag("public-rpc");
  }

  // Fail loudly per ORG, not just on a global zero. A single org that writes no snapshots from a
  // non-empty asset list has stalled — but the old check only fired when EVERY org wrote zero, so a
  // healthy sibling org (e.g. Teign) kept the run green while the other (Dart) went silently stale.
  // Flagging any per-org stall makes that visible as a red cron run.
  const stalledOrgs = Object.entries(results)
    .filter(([, r]) => {
      const edm = r.edm;
      return (edm?.assetsChecked ?? 0) > 0 && (edm?.snapshotsWritten ?? 0) === 0;
    })
    .map(([id]) => id);

  if (stalledOrgs.length) {
    // Distinguish a one-off stall from a sustained one: an org is only "sustained" if it has written
    // no snapshot since STALL_GRACE_MS ago. Transient stalls are reported in the body but return 200,
    // so a brief upstream blip can't trip Vercel's auto-disable; sustained ones still return 5xx.
    const freshCutoffMs = Date.now() - STALL_GRACE_MS;
    const sustainedOrgs: string[] = [];
    for (const orgId of stalledOrgs) {
      const { data: last } = await db
        .from("edm_snapshots")
        .select("captured_at")
        .eq("organisation_id", orgId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Parse to epoch — timestamptz string formats vary (+00:00 vs Z), so don't compare as strings.
      const lastMs = last?.captured_at ? Date.parse(last.captured_at) : NaN;
      if (!Number.isFinite(lastMs) || lastMs < freshCutoffMs) sustainedOrgs.push(orgId);
    }

    const body = {
      ...payload,
      stalledOrgs,
      error: `no snapshots written for org(s): ${stalledOrgs.join(", ")}`,
    };

    if (sustainedOrgs.length) {
      console.error(
        `[edm-sync] SUSTAINED STALL (no snapshot in >${STALL_GRACE_HOURS}h): org(s) ${sustainedOrgs.join(", ")}. errors=${JSON.stringify(errors)}`,
      );
      return NextResponse.json({ ...body, sustainedOrgs }, { status: 502 });
    }

    // Transient: a recent snapshot still exists, so the feed data on the board is not yet stale.
    console.warn(
      `[edm-sync] transient stall for org(s) ${stalledOrgs.join(", ")} — last snapshot still within ${STALL_GRACE_HOURS}h, not failing the run. errors=${JSON.stringify(errors)}`,
    );
    return NextResponse.json(body);
  }
  if (errors.length) {
    console.warn(`[edm-sync] completed with ${errors.length} error(s): ${JSON.stringify(errors)}`);
  }
  return NextResponse.json(payload);
}
