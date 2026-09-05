import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { runConsistencyChecks } from "@/lib/consistencyChecks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily data-consistency check (see vercel.json). Runs the same invariant checks the CLI does, through
// the anon client the public pages use, so a data or logic regression is caught automatically. A
// failing check returns non-200, which flags the run as errored in Vercel's cron dashboard/logs.
//
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; the same call works by hand to run it
// on demand:  curl -sH "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/data-check | jq
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createPublicClient();
  const { results, passed, failed } = await runConsistencyChecks(db);
  const payload = { ranAt: new Date().toISOString(), passed, failed, results };

  if (failed > 0) {
    const failing = results.filter((r) => !r.ok);
    console.error(`[data-check] ${failed} FAILED: ${failing.map((f) => `${f.name} — ${f.detail}`).join(" | ")}`);
    return NextResponse.json({ ...payload, error: `${failed} consistency check(s) failed` }, { status: 500 });
  }
  return NextResponse.json(payload);
}
