"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { syncOrgEa, type EaSyncSummary } from "@/lib/ea/sync";

// Fetch the last 30 days of EA rain and flow for the admin's river now. The hourly edm-sync cron does
// this anyway; the button is for after adding a gauge. (Moved from the removed /environment page.)
export async function syncEaNow(): Promise<{ summary?: EaSyncSummary; error?: string }> {
  const profile = await requireAdmin();
  const db = createAdminClient();
  const fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const summary = await syncOrgEa(db, profile.organisation_id, fromDate);
  revalidatePath("/dashboard");
  return { summary };
}
