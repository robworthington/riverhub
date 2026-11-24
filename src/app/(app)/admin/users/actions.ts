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

/** Active admins of a river (by membership role there, migration 0109), optionally excluding one user. */
async function activeAdminCount(orgId: string, exclude?: string): Promise<number> {
  const supabase = await createClient();
  const { data: admins } = await supabase
    .from("profile_orgs" as never)
    .select("profile_id")
    .eq("organisation_id" as never, orgId as never)
    .eq("role" as never, "admin" as never);
  const ids = ((admins as unknown as { profile_id: string }[]) ?? []).map((a) => a.profile_id).filter((id) => id !== exclude);
  if (!ids.length) return 0;
  const { data: active } = await supabase.from("profiles").select("id").in("id", ids).eq("active", true);
  return ((active as { id: string }[]) ?? []).length;
}

/** The member's role in this river, and whether it's their home river. */
async function membership(orgId: string, userId: string): Promise<{ role: AppRole | null; homeHere: boolean }> {
  const supabase = await createClient();
  const [{ data: m }, { data: p }] = await Promise.all([
    supabase.from("profile_orgs" as never).select("role").eq("organisation_id" as never, orgId as never).eq("profile_id" as never, userId as never).maybeSingle(),
    supabase.from("profiles").select("organisation_id").eq("id", userId).maybeSingle(),
  ]);
  return {
    role: (m as unknown as { role: AppRole } | null)?.role ?? null,
    homeHere: (p as { organisation_id: string } | null)?.organisation_id === orgId,
  };
}

/**
 * Invite someone to the river the admin is working on. A new email gets an account with this river as
 * its home; an email that already has an account is added to this river with the chosen role.
 */
export async function inviteUser(email: string, fullName: string, role: AppRole): Promise<Res> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  const supabase = await createClient();
  const redirectTo = `${siteUrl()}/accept-invite`;
  const clean = email.trim().toLowerCase();

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === clean);
  if (existing) {
    const { data: prof } = await admin.from("profiles").select("id").eq("id", existing.id).maybeSingle();
    if (!prof) {
      const { error } = await supabase
        .from("profiles")
        .insert({ id: existing.id, organisation_id: profile.organisation_id, full_name: fullName || null, role });
      if (error) return { error: error.message };
    }
    const { error: mErr } = await supabase
      .from("profile_orgs" as never)
      .upsert({ profile_id: existing.id, organisation_id: profile.organisation_id, role } as never, { onConflict: "profile_id,organisation_id" });
    if (mErr) return { error: mErr.message };
    revalidatePath("/admin/users");
    return { ok: true, note: "They already had a River Hub account, so this river was added to it. They'll see it in the river switcher." };
  }

  let userId: string | undefined;
  let note: string | undefined;
  if (emailConfigured()) {
    // generate the invite link ourselves and send a branded email via Resend
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: clean, options: { redirectTo } });
    if (error || !data?.user) return { error: error?.message ?? "Could not create invite." };
    userId = data.user.id;
    const link = data.properties?.action_link;
    if (link) {
      const sent = await sendEmail({ to: clean, subject: "You've been invited to River Hub", html: inviteEmailHtml(link) });
      if (!sent.ok) note = `User created but email failed: ${sent.error}`;
    }
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(clean, { redirectTo });
    if (error || !data?.user) return { error: error?.message ?? "Invite failed." };
    userId = data.user.id;
  }

  // home river = this one; the profiles trigger adds the matching membership (migration 0109)
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
  const current = await membership(profile.organisation_id, userId);
  if (!current.role) return { error: "They're not a member of this river." };
  // don't demote the river's last active admin
  if (role !== "admin" && current.role === "admin" && (await activeAdminCount(profile.organisation_id, userId)) === 0) {
    return { error: "Can't change role — this is the only active admin on this river." };
  }
  // the role on this river; a trigger keeps the home-river role on the profile in step (migration 0109)
  const { error } = await supabase
    .from("profile_orgs" as never)
    .update({ role } as never)
    .eq("organisation_id" as never, profile.organisation_id as never)
    .eq("profile_id" as never, userId as never);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Remove a member whose home river is elsewhere from this river (their account is untouched). */
export async function removeFromRiver(userId: string): Promise<Res> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_river_member" as never, { p_profile: userId } as never);
  if (error) {
    const msg: Record<string, string> = {
      home_river: "This is their home river: deactivate the account instead.",
      last_admin: "They're the only active admin on this river.",
      not_yourself: "You can't remove yourself.",
    };
    return { error: msg[Object.keys(msg).find((k) => error.message.includes(k)) ?? ""] ?? error.message };
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean): Promise<Res> {
  const profile = await requireAdmin();
  if (userId === profile.id && !active) return { error: "You can't deactivate your own account." };
  // Deactivating signs someone out of every river, so only their home river's admins can do it.
  const m = await membership(profile.organisation_id, userId);
  if (!m.homeHere) return { error: 'Their home river is elsewhere: use "Remove from river" instead.' };
  if (!active && m.role === "admin" && (await activeAdminCount(profile.organisation_id, userId)) === 0) {
    return { error: "Can't deactivate — this is the only active admin on this river." };
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
  if (!(await membership(profile.organisation_id, userId)).homeHere) return { error: 'Their home river is elsewhere: use "Remove from river" instead.' };
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
