import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { downloadNirs } from "@/lib/nirs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 2000;

// Weekly import of the EA's pollution incidents (see vercel.json). Downloads the whole dataset (the EA
// refreshes it quarterly; re-downloading also renews the one-year Conditional Licence), upserts it in
// batches, then links each incident to the nearest River Hub overflow or works within 1 km.
//
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; the same call works by hand:
//   curl -sH "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/pollution-incidents
// A failed download returns 200 with ok:false (logged): Vercel disables a cron after repeated 5xx
// runs, and a weekly job shouldn't be switched off by one bad EA response.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();

  let rows;
  try {
    rows = await downloadNirs();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[pollution-incidents] download/parse failed: ${error}`);
    return NextResponse.json({ ok: false, error });
  }
  if (rows.length < 1000) {
    // A truncated or changed file: don't overwrite a good load with a bad one.
    console.error(`[pollution-incidents] only ${rows.length} incidents parsed; skipping load`);
    return NextResponse.json({ ok: false, error: `Only ${rows.length} incidents parsed` });
  }

  const db = createAdminClient();
  let loaded = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await db.rpc("load_pollution_incidents", { p_rows: rows.slice(i, i + BATCH) });
    if (error) {
      console.error(`[pollution-incidents] load failed at batch ${i / BATCH}: ${error.message}`);
      return NextResponse.json({ ok: false, error: error.message, loaded }, { status: 500 });
    }
    loaded += data ?? 0;
  }
  const { data: linked, error: assignErr } = await db.rpc("assign_pollution_incidents");
  if (assignErr) {
    console.error(`[pollution-incidents] assign failed: ${assignErr.message}`);
    return NextResponse.json({ ok: false, error: assignErr.message, loaded }, { status: 500 });
  }
  revalidateTag("public-rpc");

  const summary = { ok: true, parsed: rows.length, loaded, linked: linked ?? 0, ms: Date.now() - started };
  console.log(`[pollution-incidents] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
