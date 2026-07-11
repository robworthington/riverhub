"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export async function createApiKey(name: string): Promise<{ ok: boolean; key?: string; error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const raw = "rvh_" + randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const { error } = await supabase.from("api_keys").insert({
    organisation_id: profile.organisation_id, name: name.trim() || null,
    key_prefix: raw.slice(0, 12), key_hash: hash, created_by: profile.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/api-keys");
  return { ok: true, key: raw };
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/api-keys");
  return { ok: true };
}
