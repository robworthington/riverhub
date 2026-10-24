"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Set the signed-in member's active river (B4). The switch_org RPC validates membership, so a member
 * can only switch to a river they belong to. Revalidates the whole app so every page re-reads with the
 * new current_org().
 */
export async function switchRiver(orgId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("switch_org", { p_org: orgId });
  revalidatePath("/", "layout");
}
