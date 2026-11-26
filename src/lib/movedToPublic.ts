import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { memberRiver, publicPath } from "@/lib/memberRiver";

// Member pages removed in Nov 2026 because the public site shows the same: old bookmarks and links
// land on the public page for the member's own river instead of a 404.
export async function redirectToPublic(path: string): Promise<never> {
  const profile = await requireProfile();
  const river = await memberRiver(await createClient(), profile.organisation_id);
  redirect(publicPath(river.slug, path));
}
