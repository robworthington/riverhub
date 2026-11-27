"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTask } from "@/lib/auth";

export interface ResultInput {
  site_id: string;
  test_type_id: string;
  date_collected: string;
  time_collected?: string | null;
  person_collecting?: string | null;
  organisation_collecting?: string | null;
  result?: number | null;
  result_class?: string | null;
  chain_of_custody_path?: string | null;
  rainfall?: number | null;
  temperature_c?: number | null;
  salinity_ppt?: number | null;
  condition?: "wet" | "dry" | null;
  other_observations?: string | null;
}

export async function createResult(input: ResultInput): Promise<{ error?: string }> {
  const profile = await requireTask("data_entry", "sampling");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("test_results")
    .insert({
      ...input,
      organisation_id: profile.organisation_id,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save result." };

  revalidatePath("/results");
  redirect(`/results/${data.id}`);
}

/**
 * Approve or reject results in my group (migration 0130). Needs the sampling task; the database
 * checks it again (trigger test_results_review) and records who reviewed them and when.
 */
export async function reviewResults(ids: string[], status: "approved" | "rejected" | "pending", note?: string): Promise<{ error?: string; ok?: boolean; n?: number }> {
  if (!ids.length) return { ok: true, n: 0 };
  if (!["approved", "rejected", "pending"].includes(status)) return { error: "Unknown status." };
  const profile = await requireTask("sampling");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("test_results")
    .update({ status, review_note: status === "rejected" ? (note?.trim() || null) : null } as never)
    .in("id", ids)
    .eq("group_id" as never, (profile.active_group_id ?? "") as never)
    .select("id");
  if (error) return { error: error.message.includes("needs_sampling") ? "You need the sampling task to review results." : error.message };
  revalidatePath("/results");
  revalidatePath("/results/review");
  revalidatePath("/dashboard");
  return { ok: true, n: (data ?? []).length };
}
