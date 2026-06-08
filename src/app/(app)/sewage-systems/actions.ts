"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export interface SystemAssumptionsInput {
  g_lhd: number;
  low_variation_pct: number;
  high_variation_pct: number;
  infiltration_m3d: number;
  trade_effluent_m3d: number;
  population_override: number | null;
  notes: string | null;
}

/** Admin: save the editable population/capacity assumptions for a system. */
export async function upsertSystemAssumptions(
  systemId: string,
  input: SystemAssumptionsInput,
): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("system_assumptions").upsert(
    {
      system_id: systemId,
      organisation_id: profile.organisation_id,
      ...input,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/sewage-systems/${systemId}`);
  return {};
}

/**
 * Admin: recompute the ONS base population P from parish census data (point-in-polygon over the
 * system's geocoded assets) and store it. Requires parish census populations to be loaded first
 * (scripts/estimate_system_population.py).
 */
export async function refreshSystemPopulationFromOns(
  systemId: string,
): Promise<{ error?: string; population?: number }> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("system_ons_population", { p_system: systemId });
  if (error) return { error: error.message };
  const population = (data as number | null) ?? 0;

  const { error: upErr } = await supabase.from("system_assumptions").upsert(
    {
      system_id: systemId,
      organisation_id: profile.organisation_id,
      ons_population: population,
      ons_calculated_at: new Date().toISOString(),
      ons_source: "ONS Census 2021 OA→parish best-fit (recomputed in-app)",
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system_id" },
  );
  if (upErr) return { error: upErr.message };
  revalidatePath(`/sewage-systems/${systemId}`);
  return { population };
}
