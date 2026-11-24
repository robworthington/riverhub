"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireModerator } from "@/lib/auth";
import { publishPhoto, unpublishPhoto, photoPagePaths } from "@/lib/photoPublish";

/** A moderator keeps or hides a reported photo on any river (migration 0110). Moderators aren't admins
 *  of each river, so publishing or unpublishing the public copy uses the service role. */
export async function moderatePhotoReports(photoId: string, outcome: "kept" | "hidden"): Promise<{ error?: string }> {
  const me = await requireModerator();
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: p } = await admin.from("river_photos").select("*").eq("id", photoId).single();
  if (!p) return { error: "Photo not found." };
  const { error } = await supabase.rpc("resolve_photo_reports" as never, { p_photo: photoId, p_outcome: outcome } as never);
  if (error) return { error: error.message };
  const row = p as { status: string; hidden_by_reports?: boolean; organisation_id: string; asset_id: string | null };
  let err: string | null = null;
  if (outcome === "kept" && row.status === "hidden" && row.hidden_by_reports) err = await publishPhoto(admin, p as never, me.id);
  else if (outcome === "hidden" && row.status === "approved") err = await unpublishPhoto(admin, p as never);
  if (err) return { error: err };
  for (const path of await photoPagePaths(admin, row.organisation_id, row.asset_id)) revalidatePath(path);
  revalidatePath("/admin/photo-reports");
  return {};
}
