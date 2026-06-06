import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncOrgEdm, type SyncSummary } from "@/lib/edm/sync";

export const dynamic = "force-dynamic";

// Daily EDM ingestion. Triggered by Vercel Cron (see vercel.json) with
// `Authorization: Bearer ${CRON_SECRET}`. Runs the sync for every organisation.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: orgs, error } = await db.from("organisations").select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, SyncSummary> = {};
  for (const org of orgs ?? []) {
    results[org.id] = await syncOrgEdm(db, org.id, today);
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), today, results });
}
