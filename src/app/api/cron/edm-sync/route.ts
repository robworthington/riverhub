import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { syncOrgEdm } from "@/lib/edm/sync";
import { syncOrgEa } from "@/lib/ea/sync";

export const dynamic = "force-dynamic";
// Orgs are synced sequentially and each does several ArcGIS + EA fetches, so a slow upstream response
// can push the run past the platform's default ~10s cap — killing it mid-loop and leaving the org(s)
// processed last (e.g. Dart) unwritten while earlier ones succeed. Give the whole run generous headroom.
export const maxDuration = 60;

// A single stalled run (0 snapshots, e.g. a brief ArcGIS/DB blip) must NOT return 5xx: Vercel
// disables a cron job after repeated failed runs, so one bad hour could switch the whole sync off
// (this is how the Teign cron ended up disabled). Only escalate to 5xx once an org has had no fresh
// snapshot for this long — a sustained outage worth a red run and an alert.
const STALL_GRACE_HOURS = 3;
const STALL_GRACE_MS = STALL_GRACE_HOURS * 3_600_000;

// Daily ingestion (EDM spills + EA rainfall/flow). Triggered by Vercel Cron
// (see vercel.json) with `Authorization: Bearer ${CRON_SECRET}`. Runs for every org.
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

  const { data: orgs, error } = await db.from("organisations").select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, unknown> = {};
  let totalSnapshots = 0;
  const errors: string[] = [];
  for (const org of orgs ?? []) {
    const edm = await syncOrgEdm(db, org.id, nowIso);
    const ea = await syncOrgEa(db, org.id, fromDate);
    results[org.id] = { edm, ea };
    totalSnapshots += edm.snapshotsWritten;
    if (edm.errors.length) errors.push(...edm.errors.map((e) => `${org.id} edm: ${e}`));
    // A healthy run writes one snapshot per monitored asset, so 0 from a non-empty asset list is a stall.
    if (edm.assetsChecked > 0 && edm.snapshotsWritten === 0) {
      console.warn(`[edm-sync] org ${org.id}: 0 snapshots from ${edm.assetsChecked} assets — feed fetch or match failed`);
    }
  }

  const payload = { ranAt: new Date().toISOString(), today, orgs: orgs?.length ?? 0, totalSnapshots, errors, results };

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
      const edm = (r as { edm?: { assetsChecked?: number; snapshotsWritten?: number } }).edm;
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
