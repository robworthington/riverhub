"use server";

import { SITE_URL } from "@/lib/site";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireModerator } from "@/lib/auth";
import { riverPath } from "@/lib/river-context";
import type { AdoptionRequest } from "@/lib/adoption";
import {
  emailConfigured, sendEmail, adoptionApprovedInviteHtml, adoptionApprovedExistingHtml, adoptionDeclinedHtml,
} from "@/lib/email";

type Res = { ok?: boolean; error?: string; note?: string };

const siteUrl = () => SITE_URL;

const DECISION_ERROR: Record<string, string> = {
  not_moderator: "Only River Hub moderators can do that.",
  not_pending: "That request has already been decided.",
  already_adopted: "Another group already looks after this river. Decline this request, or contact the group first.",
};
const decisionError = (msg: string) =>
  DECISION_ERROR[Object.keys(DECISION_ERROR).find((k) => msg.includes(k)) ?? ""] ?? msg;

async function loadRequest(id: string) {
  const admin = createAdminClient();
  const { data: req } = await admin.from("adoption_requests" as never).select("*").eq("id" as never, id as never).single();
  const r = req as unknown as AdoptionRequest | null;
  if (!r) return null;
  const { data: org } = await admin.from("organisations").select("river_name, river_slug").eq("id", r.organisation_id).single();
  const o = org as { river_name: string | null; river_slug: string | null } | null;
  return { r, riverName: o?.river_name ?? "river", riverSlug: o?.river_slug ?? "" };
}

/**
 * Set up the group's first admin for an approved request: a new account (invited to set a password)
 * or, if the email already has one, the river added to it with admin access. Records the account on
 * the request. Safe to re-run ("Retry invitation") if a previous attempt failed part-way.
 */
async function setUpGroupAdmin(id: string): Promise<Res> {
  const loaded = await loadRequest(id);
  if (!loaded) return { error: "Request not found." };
  const { r, riverName } = loaded;
  if (r.status !== "approved") return { error: "Only approved requests get an account." };
  const admin = createAdminClient();
  const email = r.email.toLowerCase();
  const redirectTo = `${siteUrl()}/accept-invite`;
  let note: string | undefined;

  // An existing account for this email? (listUsers has no email filter; the member count is small.)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  if (existing) {
    userId = existing.id;
    if (emailConfigured()) {
      const sent = await sendEmail({
        to: email,
        subject: `${r.group_name} now looks after the ${riverName} on River Hub`,
        html: adoptionApprovedExistingHtml({ groupName: r.group_name, riverName, link: `${siteUrl()}/login` }),
      });
      if (!sent.ok) note = `River added to their existing account, but the email failed: ${sent.error}`;
    } else {
      note = "They already had an account, so the river was added to it. Email isn't set up, so let them know yourself.";
    }
  } else if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (error || !data?.user) return { error: `Couldn't create the account: ${error?.message ?? "unknown error"}` };
    userId = data.user.id;
    const link = data.properties?.action_link;
    const sent = link
      ? await sendEmail({
          to: email,
          subject: `Set up your River Hub account for the ${riverName}`,
          html: adoptionApprovedInviteHtml({ groupName: r.group_name, riverName, link }),
        })
      : { ok: false, error: "no link" };
    if (!sent.ok) note = `Account created, but the invitation email failed: ${sent.error}. Use "Resend" on the Users page of that river.`;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data?.user) return { error: `Couldn't send the invitation: ${error?.message ?? "unknown error"}` };
    userId = data.user.id;
    note = "Invitation sent with Supabase's standard email (branded email isn't set up).";
  }

  // Their profile (home river = this one if new) and admin membership of this river.
  const { data: prof } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!prof) {
    const { error } = await admin.from("profiles").insert({
      id: userId, organisation_id: r.organisation_id, full_name: r.contact_name, role: "admin",
    } as never);
    if (error) return { error: `Account created, but the profile couldn't be saved: ${error.message}` };
  }
  const { error: mErr } = await admin
    .from("profile_orgs" as never)
    .upsert({ profile_id: userId, organisation_id: r.organisation_id, role: "admin" } as never, { onConflict: "profile_id,organisation_id" });
  if (mErr) return { error: `Account ready, but adding them to the river failed: ${mErr.message}` };

  await admin.from("adoption_requests" as never).update({ invited_user_id: userId } as never).eq("id" as never, id as never);
  return { ok: true, note };
}

export async function approveAdoption(id: string): Promise<Res> {
  await requireModerator();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_adoption" as never, { p_id: id } as never);
  if (error) return { error: decisionError(error.message) };
  const res = await setUpGroupAdmin(id);
  revalidatePath("/admin/adoptions");
  // the river's pages now name the group: refresh them rather than wait for the 10-minute cache
  const loaded = await loadRequest(id);
  if (loaded?.riverSlug) revalidatePath(riverPath(loaded.riverSlug, "/"), "layout");
  revalidatePath("/", "layout");
  if (res.error) return { error: `The river has been handed to the group, but: ${res.error} Use "Retry invitation".` };
  return res;
}

export async function retryInvitation(id: string): Promise<Res> {
  await requireModerator();
  const res = await setUpGroupAdmin(id);
  revalidatePath("/admin/adoptions");
  return res;
}

export async function declineAdoption(id: string, note: string, spam: boolean): Promise<Res> {
  await requireModerator();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_adoption" as never, { p_id: id, p_status: spam ? "spam" : "rejected", p_note: note } as never);
  if (error) return { error: decisionError(error.message) };
  let msg: string | undefined;
  if (!spam) {
    const loaded = await loadRequest(id);
    if (loaded && emailConfigured()) {
      const sent = await sendEmail({
        to: loaded.r.email,
        subject: `Your request to adopt the ${loaded.riverName}`,
        html: adoptionDeclinedHtml({
          groupName: loaded.r.group_name, riverName: loaded.riverName, note: note.trim() || null,
          riverUrl: `${siteUrl()}${riverPath(loaded.riverSlug, "/explore/spills")}`,
        }),
      });
      if (!sent.ok) msg = `Declined, but the email to the group failed: ${sent.error}`;
    } else if (loaded) {
      msg = "Declined. Email isn't set up, so let the group know yourself.";
    }
  }
  revalidatePath("/admin/adoptions");
  return { ok: true, note: msg };
}
