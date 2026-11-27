"use server";

// Members of the group the signed-in member is working as (migration 0126, ROLES-AND-GROUPS-SPEC.md).
// Changes to the group go through security definer functions (add_group_member, set_group_member,
// remove_group_member) that check the membership task and the last-lead rule in the database; the
// checks here only give friendlier messages. Account-level steps (creating the login, emails,
// deactivating) need the service role and stay here.

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireProfile, requireTask } from "@/lib/auth";
import { emailConfigured, sendEmail, inviteEmailHtml, resetEmailHtml, groupInviteNewHtml, groupInviteExistingHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { memberRiver } from "@/lib/memberRiver";
import { BASE_ROLES, TASKS, defaultTasks, type BaseRole, type Task } from "@/lib/tasks";
import type { Profile } from "@/lib/types";

type Res = { error?: string; ok?: boolean; note?: string };

const ERRORS: Record<string, string> = {
  not_allowed: "You need the membership task in this group.",
  lead_only: "Only a lead can make someone a lead, or change or remove a lead.",
  last_lead: "A group must keep at least one lead.",
  not_member: "They're not a member of this group.",
  not_yourself: "You can't remove yourself.",
  bad_task: "Unknown task.",
  already_member: "They're already in this group.",
  not_open: "That invitation isn't open any more.",
  not_pending: "That request has already been dealt with.",
};
function friendly(message: string): string {
  const k = Object.keys(ERRORS).find((key) => message.includes(key));
  return k ? ERRORS[k] : message;
}


async function requireMembership(): Promise<Profile & { groupId: string }> {
  const me = await requireTask("membership");
  if (!me.active_group_id) throw new Error("No current group.");
  return { ...me, groupId: me.active_group_id };
}

/** The person's row in my current group, if they have one. */
async function memberRow(groupId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_members" as never)
    .select("base_role, status")
    .eq("group_id" as never, groupId as never)
    .eq("profile_id" as never, userId as never)
    .maybeSingle();
  return data as unknown as { base_role: BaseRole; status: string } | null;
}

/** How many active groups the person is in (service role: other groups aren't visible to me). */
async function groupCount(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("group_members" as never)
    .select("group_id", { count: "exact", head: true })
    .eq("profile_id" as never, userId as never)
    .eq("status" as never, "active" as never);
  return count ?? 0;
}

/** Group and river names for invitation emails. */
async function inviteContext(me: Profile & { groupId: string }) {
  const supabase = await createClient();
  const [{ data: g }, river] = await Promise.all([
    supabase.from("groups" as never).select("name").eq("id" as never, me.groupId as never).maybeSingle(),
    memberRiver(supabase, me.organisation_id),
  ]);
  return { groupName: (g as unknown as { name: string } | null)?.name ?? river.groupName, riverName: river.riverName, inviter: me.full_name };
}

/**
 * Email an invitation link (migration 0129). Someone new gets a Supabase invite that sets their
 * password and then lands on /auth/accept, which lists their invitations; someone with an account
 * gets a link straight to /auth/accept?token=…, where they sign in and accept.
 * Returns a note (and the link) when the email couldn't be sent, so it can be passed on by hand.
 */
async function sendInvitation(email: string, token: string, role: BaseRole, ctx: { groupName: string; riverName: string; inviter: string | null }): Promise<Res> {
  const admin = createAdminClient();
  const acceptLink = `${SITE_URL}/auth/accept?token=${encodeURIComponent(token)}`;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  const confirmed = !!existing?.email_confirmed_at;

  if (confirmed) {
    if (!emailConfigured()) return { ok: true, note: `Email isn't set up here: send them this link yourself: ${acceptLink}` };
    const sent = await sendEmail({ to: email, subject: `Join ${ctx.groupName} on River Hub`, html: groupInviteExistingHtml({ link: acceptLink, role, ...ctx }) });
    return sent.ok ? { ok: true } : { ok: true, note: `Invitation saved but the email failed (${sent.error}). Their link: ${acceptLink}` };
  }

  // new (or never-confirmed) address: a Supabase invite sets the password, then /accept-invite sends them on
  const redirectTo = `${SITE_URL}/accept-invite`;
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    const link = data?.properties?.action_link;
    if (error || !link) return { ok: true, note: `Invitation saved but the sign-up link couldn't be made (${error?.message ?? "no link"}).` };
    const sent = await sendEmail({ to: email, subject: `Join ${ctx.groupName} on River Hub`, html: groupInviteNewHtml({ link, role, ...ctx }) });
    return sent.ok ? { ok: true } : { ok: true, note: `Invitation saved but the email failed: ${sent.error}` };
  }
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  return error ? { ok: true, note: `Invitation saved but the email failed: ${error.message}` } : { ok: true };
}

/** Invite someone to my current group. Nothing changes in the group until they accept. */
export async function inviteUser(email: string, fullName: string, baseRole: BaseRole, tasks?: Task[]): Promise<Res> {
  if (!BASE_ROLES.includes(baseRole) || (tasks && !tasks.every((t) => TASKS.includes(t)))) return { error: "Unknown role or task." };
  const me = await requireMembership();
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { error: "That doesn't look like an email address." };
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation" as never, {
    p_email: clean, p_full_name: fullName || null, p_base_role: baseRole, p_tasks: tasks ?? defaultTasks(baseRole),
  } as never);
  if (error) return { error: friendly(error.message) };
  const res = await sendInvitation(clean, token as unknown as string, baseRole, await inviteContext(me));
  revalidatePath("/admin/users");
  return res;
}

/** A new link and another 14 days for an open invitation. */
export async function resendInvitation(id: string): Promise<Res> {
  const me = await requireMembership();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invitations" as never).select("email, base_role").eq("id" as never, id as never).maybeSingle();
  const row = inv as unknown as { email: string; base_role: BaseRole } | null;
  if (!row) return { error: "That invitation isn't open any more." };
  const { data: token, error } = await supabase.rpc("resend_invitation" as never, { p_id: id } as never);
  if (error) return { error: friendly(error.message) };
  const res = await sendInvitation(row.email, token as unknown as string, row.base_role, await inviteContext(me));
  revalidatePath("/admin/users");
  return res;
}

export async function cancelInvitation(id: string): Promise<Res> {
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invitation" as never, { p_id: id } as never);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Invite someone who asked to join from the group's public page. */
export async function inviteFromRequest(id: string, baseRole: BaseRole): Promise<Res> {
  if (!BASE_ROLES.includes(baseRole)) return { error: "Unknown role." };
  const me = await requireMembership();
  const supabase = await createClient();
  const { data: jr } = await supabase.from("join_requests" as never).select("name, email, status").eq("id" as never, id as never).maybeSingle();
  const row = jr as unknown as { name: string; email: string; status: string } | null;
  if (!row || row.status !== "pending") return { error: "That request has already been dealt with." };
  const { data: token, error } = await supabase.rpc("create_invitation" as never, {
    p_email: row.email, p_full_name: row.name, p_base_role: baseRole, p_tasks: defaultTasks(baseRole), p_join_request: id,
  } as never);
  if (error) return { error: friendly(error.message) };
  const res = await sendInvitation(row.email, token as unknown as string, baseRole, await inviteContext(me));
  revalidatePath("/admin/users");
  return res;
}

export async function declineRequest(id: string, spam = false): Promise<Res> {
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_join_request" as never, { p_id: id, p_status: spam ? "spam" : "declined" } as never);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Change someone's base role and tasks in my current group. */
export async function updateMember(userId: string, baseRole: BaseRole, tasks: Task[]): Promise<Res> {
  if (!BASE_ROLES.includes(baseRole) || !tasks.every((t) => TASKS.includes(t))) return { error: "Unknown role or task." };
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_group_member" as never,
    { p_profile: userId, p_base_role: baseRole, p_tasks: tasks } as never);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Take someone out of my current group. Their account, other groups and past results are kept. */
export async function removeMember(userId: string): Promise<Res> {
  await requireMembership();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_group_member" as never, { p_profile: userId } as never);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Deactivate or reactivate an account. Only for people in no group but mine (else: remove them). */
export async function setUserActive(userId: string, active: boolean): Promise<Res> {
  const me = await requireMembership();
  if (userId === me.id && !active) return { error: "You can't deactivate your own account." };
  const row = await memberRow(me.groupId, userId);
  if (!row) return { error: "They're not a member of this group." };
  if ((await groupCount(userId)) > 1) return { error: "They're in other groups too: remove them from this group instead." };
  const admin = createAdminClient();
  if (!active && row.base_role === "lead" && row.status === "active") {
    const { data: leads } = await admin
      .from("group_members" as never)
      .select("profile_id")
      .eq("group_id" as never, me.groupId as never)
      .eq("base_role" as never, "lead" as never)
      .eq("status" as never, "active" as never)
      .neq("profile_id" as never, userId as never);
    const ids = ((leads as unknown as { profile_id: string }[]) ?? []).map((l) => l.profile_id);
    const { data: activeLeads } = ids.length
      ? await admin.from("profiles").select("id").in("id", ids).eq("active", true)
      : { data: [] };
    if (!(activeLeads ?? []).length) return { error: ERRORS.last_lead };
  }
  const { error } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (error) return { error: error.message };
  // ban / unban the login so an existing session can't keep working
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resendInvite(userId: string): Promise<Res> {
  const me = await requireMembership();
  if (!(await memberRow(me.groupId, userId))) return { error: "They're not a member of this group." };
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { error: "No email for this person." };
  const redirectTo = `${SITE_URL}/accept-invite`;
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (error || !data?.properties?.action_link) return { error: error?.message ?? "Could not generate link." };
    const river = await memberRiver(await createClient(), me.organisation_id);
    const sent = await sendEmail({ to: email, subject: "Your River Hub invitation", html: inviteEmailHtml(data.properties.action_link, river) });
    if (!sent.ok) return { error: sent.error };
  } else {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return { error: error.message };
  }
  return { ok: true };
}

/** Cancel an invitation nobody has used: deletes the account if it's in no other group. */
export async function revokeInvite(userId: string): Promise<Res> {
  const me = await requireMembership();
  if (userId === me.id) return { error: "You can't remove your own account." };
  if (!(await memberRow(me.groupId, userId))) return { error: "They're not a member of this group." };
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (u?.user?.last_sign_in_at) return { error: "They've already signed in: remove or deactivate them instead." };
  if ((await groupCount(userId)) > 1) return removeMember(userId);
  await admin.from("profiles").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function sendPasswordReset(userId: string): Promise<Res> {
  const me = await requireMembership();
  if (!(await memberRow(me.groupId, userId))) return { error: "They're not a member of this group." };
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { error: "No email for this person." };
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${SITE_URL}/login` } });
    if (error || !data?.properties?.action_link) return { error: error?.message ?? "Could not generate link." };
    const sent = await sendEmail({ to: email, subject: "Reset your River Hub password", html: resetEmailHtml(data.properties.action_link) });
    if (!sent.ok) return { error: sent.error };
  } else {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/login` });
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
