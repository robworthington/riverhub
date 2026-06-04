"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface ResultInput {
  site_id: string;
  test_type_id: string;
  date_collected: string;
  time_collected?: string | null;
  person_collecting?: string | null;
  organisation_collecting?: string | null;
  result?: number | null;
  chain_of_custody_path?: string | null;
  rainfall?: number | null;
  condition?: "wet" | "dry" | null;
  other_observations?: string | null;
}

export async function createResult(input: ResultInput): Promise<{ error?: string }> {
  const profile = await requireProfile();
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
