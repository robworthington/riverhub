"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { emailConfigured, sendEmail, inviteEmailHtml, resetEmailHtml } from "@/lib/email";
import type { AppRole } from "@/lib/types";

type Res = { error?: string; ok?: boolean; note?: string };

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Count active admins in the org, optionally excluding one user. */
async function activeAdminCount(orgId: string, exclude?: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("role", "admin")
    .eq("active", true);
  return ((data as { id: string }[]) ?? []).filter((p) => p.id !== exclude).length;
}

export async function inviteUser(email: string, fullName: string, role: AppRole): Promise<Res> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  const redirectTo = `${siteUrl()}/accept-invite`;

  let userId: string | undefined;
  let note: string | undefined;
  if (emailConfigured()) {
    // generate the invite link ourselves and send a branded email via Resend
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (error || !data?.user) return { error: error?.message ?? "Could not create invite." };
    userId = data.user.id;
    const link = data.properties?.action_link;
    if (link) {
      const sent = await sendEmail({ to: email, subject: "You've been invited to River Hub", html: inviteEmailHtml(link) });
      if (!sent.ok) note = `User created but email failed: ${sent.error}`;
    }
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data?.user) return { error: error?.message ?? "Invite failed." };
    userId = data.user.id;
  }

  const supabase = await createClient();
  const { error: pErr } = await supabase
    .from("profiles")
    .insert({ id: userId, organisation_id: profile.organisation_id, full_name: fullName || null, role });
  if (pErr) return { error: pErr.message };

  revalidatePath("/admin/users");
  return { ok: true, note };
}

export async function updateUserRole(userId: string, role: AppRole): Promise<Res> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  // don't demote the last active admin
  if (role !== "admin" && (await activeAdminCount(profile.organisation_id, userId)) === 0) {
    const { data: target } = await supabase.from("profiles").select("role, active").eq("id", userId).single();
    if (target && (target as { role: string }).role === "admin" && (target as { active: boolean }).active) {
      return { error: "Can't change role — this is the only active admin." };
    }
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean): Promise<Res> {
  const profile = await requireAdmin();
  if (userId === profile.id && !active) return { error: "You can't deactivate your own account." };
  if (!active && (await activeAdminCount(profile.organisation_id, userId)) === 0) {
    const supabase0 = await createClient();
    const { data: target } = await supabase0.from("profiles").select("role").eq("id", userId).single();
    if (target && (target as { role: string }).role === "admin") {
      return { error: "Can't deactivate — this is the only active admin." };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  if (error) return { error: error.message };
  // ban / unban the auth user so an existing session can't keep working
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resendInvite(userId: string): Promise<Res> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { error: "No email for this user." };
  const redirectTo = `${siteUrl()}/accept-invite`;
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (error || !data?.properties?.action_link) return { error: error?.message ?? "Could not generate link." };
    const sent = await sendEmail({ to: email, subject: "Your River Hub invitation", html: inviteEmailHtml(data.properties.action_link) });
    if (!sent.ok) return { error: sent.error };
  } else {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return { error: error.message };
  }
  return { ok: true };
}

export async function revokeInvite(userId: string): Promise<Res> {
  const profile = await requireAdmin();
  if (userId === profile.id) return { error: "You can't remove your own account." };
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (u?.user?.last_sign_in_at) return { error: "This user has already signed in — deactivate instead of revoking." };
  const supabase = await createClient();
  await supabase.from("profiles").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function sendPasswordReset(userId: string): Promise<Res> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { error: "No email for this user." };
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl()}/login` },
    });
    if (error || !data?.properties?.action_link) return { error: error?.message ?? "Could not generate link." };
    const sent = await sendEmail({ to: email, subject: "Reset your River Hub password", html: resetEmailHtml(data.properties.action_link) });
    if (!sent.ok) return { error: sent.error };
  } else {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/login` });
    if (error) return { error: error.message };
  }
  return { ok: true };
}

/** Self-service: any signed-in user updates their own display name. */
export async function updateOwnProfile(fullName: string): Promise<Res> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}
