"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export interface TestTypeInput {
  test_name: string;
  common_name?: string | null;
  test_code?: string | null;
  category?: "biological" | "chemical" | "physical" | null;
  subcategory?: string | null;
  measurement_type?: string | null;
  primary_unit?: string | null;
  threshold_source?: string | null;
  health_risk_levels?: string | null;
}

export async function createTestType(input: TestTypeInput): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("test_types")
    .insert({ ...input, organisation_id: profile.organisation_id });
  if (error) return { error: error.message };
  revalidatePath("/test-types");
  redirect("/test-types");
}

export async function updateTestType(
  id: string,
  input: TestTypeInput,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("test_types").update(input).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/test-types");
  redirect("/test-types");
}
