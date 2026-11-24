// Publish / unpublish a river photo's public copy (migrations 0099, 0110). Shared by the admins'
// approve/hide actions (their own session, RLS-checked), moderators and the automatic hide after
// reports (service role). Server-only: takes whichever Supabase client the caller is allowed to use.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_BUCKET, photoPaths } from "@/lib/photos";

type PhotoRow = {
  id: string; organisation_id: string; asset_id: string | null; private_path: string; thumb_private_path: string;
  public_path: string | null; thumb_public_path: string | null;
};

/** Copy the cleaned files into the public bucket and mark the photo public. */
export async function publishPhoto(db: SupabaseClient, p: PhotoRow, approverId: string | null): Promise<string | null> {
  const paths = photoPaths(p.organisation_id, p.id);
  for (const [from, to] of [[p.private_path, paths.publicLarge], [p.thumb_private_path, paths.publicThumb]] as const) {
    // A re-approval after hiding: clear any leftover public copy first.
    await db.storage.from(PUBLIC_BUCKET).remove([to]);
    const { error } = await db.storage.from("evidence").copy(from, to, { destinationBucket: PUBLIC_BUCKET });
    if (error) return `Couldn't publish the photo: ${error.message}`;
  }
  const { error } = await db.from("river_photos").update({
    status: "approved", public_path: paths.publicLarge, thumb_public_path: paths.publicThumb,
    hidden_by_reports: false, approved_by: approverId, approved_at: new Date().toISOString(),
  } as never).eq("id", p.id);
  return error?.message ?? null;
}

/** Take the photo off the public pages and delete its public copy (the private copy stays). */
export async function unpublishPhoto(db: SupabaseClient, p: PhotoRow, extra: Record<string, unknown> = {}): Promise<string | null> {
  const { error } = await db.from("river_photos")
    .update({ status: "hidden", is_hero: false, public_path: null, thumb_public_path: null, ...extra } as never)
    .eq("id", p.id);
  if (error) return error.message;
  const pub = [p.public_path, p.thumb_public_path].filter((x): x is string => !!x);
  if (pub.length) await db.storage.from(PUBLIC_BUCKET).remove(pub);
  return null;
}

/** The public pages that show a river's photos. */
export async function photoPagePaths(db: SupabaseClient, orgId: string, assetId?: string | null): Promise<string[]> {
  const { data } = await db.from("organisations").select("river_slug").eq("id", orgId).single();
  const slug = (data as { river_slug: string | null } | null)?.river_slug;
  if (!slug) return [];
  return [`/r/${slug}/explore/spills`, ...(assetId ? [`/r/${slug}/explore/spills/${assetId}`] : [])];
}
