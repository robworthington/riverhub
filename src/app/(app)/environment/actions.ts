"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { syncOrgEa, type EaSyncSummary } from "@/lib/ea/sync";

export async function syncEaNow(): Promise<{ summary?: EaSyncSummary; error?: string }> {
  const profile = await requireAdmin();
  const db = createAdminClient();
  const fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const summary = await syncOrgEa(db, profile.organisation_id, fromDate);
  revalidatePath("/environment");
  return { summary };
}
