import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { bankHolidays } from "@/lib/requests";
import { WdtkBlocked, fetchWdtkEvents, toUpdates } from "@/lib/wdtk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily: bring the request log up to date from WhatDoTheyKnow (migration 0108, see vercel.json).
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; the same call works by hand:
//   curl -sH "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/wdtk-sync
// Failures return 200 with ok:false (logged), so one bad night never gets the cron switched off.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  let events;
  try {
    events = await fetchWdtkEvents();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[wdtk-sync] ${e instanceof WdtkBlocked ? "blocked" : "fetch failed"}: ${error}`);
    return NextResponse.json({ ok: false, error });
  }
  const updates = toUpdates(events, await bankHolidays());
  if (updates.length === 0) {
    return NextResponse.json({ ok: true, events: 0, requests: 0, ms: Date.now() - started });
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("apply_wdtk_sync" as never, { p_rows: updates } as never);
  if (error) {
    console.error(`[wdtk-sync] apply failed: ${error.message}`);
    return NextResponse.json({ ok: false, error: error.message });
  }
  revalidateTag("public-rpc");
  revalidatePath("/requests");
  const summary = { ok: true, events: events.length, requests: updates.length, ...(data as object), ms: Date.now() - started };
  console.log(`[wdtk-sync] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
