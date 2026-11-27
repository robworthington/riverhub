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
import { sendInvitation } from "@/lib/invitations";

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
 * Invite the contact on an approved request as the lead of the river's new group (migration 0131):
 * an ordinary invitation (14 days), so nothing changes until they accept. Someone new sets a password
 * first; someone with an account signs in and accepts. Safe to re-run ("Retry invitation"): a new
 * invitation replaces the old one, until a lead has accepted.
 */
async function inviteGroupLead(id: string): Promise<Res> {
  const loaded = await loadRequest(id);
  if (!loaded) return { error: "Request not found." };
  const { r, riverName } = loaded;
  if (r.status !== "approved") return { error: "Only approved requests get an invitation." };
  const admin = createAdminClient();
  const { data: groups } = await admin
    .from("group_rivers" as never)
    .select("group_id, groups(name)")
    .eq("organisation_id" as never, r.organisation_id as never);
  const list = (groups as unknown as { group_id: string; groups: { name: string } | null }[]) ?? [];
  const group = list.find((g) => g.groups?.name === r.group_name) ?? list[0];
  if (!group) return { error: "The river has no group to invite them to." };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("platform_invite" as never, {
    p_group: group.group_id, p_org: r.organisation_id, p_email: r.email, p_full_name: r.contact_name, p_base_role: "lead",
  } as never);
  if (error) {
    if (error.message.includes("not_allowed")) return { error: "The group already has a lead, so there's nothing to retry." };
    if (error.message.includes("already_member")) return { ok: true, note: "They're already in the group." };
    return { error: error.message };
  }
  const groupName = group.groups?.name ?? r.group_name;
  return sendInvitation(r.email.toLowerCase(), token as unknown as string, "lead", { groupName, riverName, inviter: null }, {
    subject: `${groupName} now looks after the ${riverName} on River Hub`,
    newHtml: (link) => adoptionApprovedInviteHtml({ groupName, riverName, link }),
    existingHtml: (link) => adoptionApprovedExistingHtml({ groupName, riverName, link }),
  });
}

export async function approveAdoption(id: string): Promise<Res> {
  await requireModerator();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_adoption" as never, { p_id: id } as never);
  if (error) return { error: decisionError(error.message) };
  const res = await inviteGroupLead(id);
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
  const res = await inviteGroupLead(id);
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
