"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export async function inviteUser(
  email: string,
  fullName: string,
  role: "admin" | "volunteer",
): Promise<{ error?: string; ok?: boolean }> {
  const profile = await requireAdmin();
  const admin = createAdminClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/accept-invite`,
  });
  if (error || !data?.user) return { error: error?.message ?? "Invite failed." };

  // Use the RLS-bound client (admin role) to create the profile in this org.
  const supabase = await createClient();
  const { error: pErr } = await supabase.from("profiles").insert({
    id: data.user.id,
    organisation_id: profile.organisation_id,
    full_name: fullName || null,
    role,
  });
  if (pErr) return { error: pErr.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
