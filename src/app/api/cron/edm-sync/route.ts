import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncOrgEdm } from "@/lib/edm/sync";
import { syncOrgEa } from "@/lib/ea/sync";

export const dynamic = "force-dynamic";

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

  // Fail loudly so a silent stall is visible in Vercel's cron logs (non-200 flags the run as errored).
  if (totalSnapshots === 0) {
    console.error(`[edm-sync] STALL: 0 EDM snapshots written across ${orgs?.length ?? 0} org(s). errors=${JSON.stringify(errors)}`);
    return NextResponse.json({ ...payload, error: "no snapshots written across any org" }, { status: 502 });
  }
  if (errors.length) {
    console.warn(`[edm-sync] completed with ${errors.length} error(s): ${JSON.stringify(errors)}`);
  }
  return NextResponse.json(payload);
}
