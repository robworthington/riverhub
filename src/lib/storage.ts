import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns a short-lived signed URL for a private 'evidence' object.
 * Reads always go through the server (org membership already enforced by RLS
 * on the owning row before we reach here).
 */
export async function getSignedUrl(path: string, expiresIn = 60 * 10) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("evidence").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
