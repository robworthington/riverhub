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
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const { data: orgs, error } = await db.from("organisations").select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, unknown> = {};
  for (const org of orgs ?? []) {
    results[org.id] = {
      edm: await syncOrgEdm(db, org.id, today),
      ea: await syncOrgEa(db, org.id, fromDate),
    };
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), today, results });
}
