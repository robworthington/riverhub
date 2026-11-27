"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Set the signed-in member's active river (B4). The switch_org RPC validates membership, so a member
 * can only switch to a river they belong to. Revalidates the whole app so every page re-reads with the
 * new current_org().
 */
export async function switchRiver(orgId: string, groupId?: string): Promise<void> {
  const supabase = await createClient();
  // switch_org also sets the active group (migration 0126): the one asked for, else the member's
  // current group if it works on this river, else their first group there.
  await supabase.rpc("switch_org" as never, (groupId ? { p_org: orgId, p_group: groupId } : { p_org: orgId }) as never);
  revalidatePath("/", "layout");
}
