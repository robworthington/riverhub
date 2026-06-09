import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Returns the signed-in user's profile (org + role), or redirects to /login.
 * Deactivated accounts are treated as signed-out.
 * Use at the top of authenticated Server Components / Actions.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  const p = profile as Profile;
  if (!p.active) redirect("/login?deactivated=1");
  return p;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/** Admin or volunteer — i.e. may create/edit data. Viewers are read-only. */
export async function requireEditor(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "volunteer") redirect("/dashboard");
  return profile;
}

export function canEdit(role: AppRoleLike): boolean {
  return role === "admin" || role === "volunteer";
}
type AppRoleLike = "admin" | "volunteer" | "viewer";
