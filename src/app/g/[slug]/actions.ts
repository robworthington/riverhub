"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/server";
import { emailConfigured, sendEmail, joinRequestAlertHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export type JoinState = { ok?: boolean; error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const ERRORS: Record<string, string> = {
  group_not_found: "This group isn't taking requests just now.",
  already_pending: "You've already asked to join: the group will be in touch.",
  already_member: "You're already a member. Sign in to the members' area.",
  rate_limited: "Too many requests from here today. Please try again tomorrow.",
};

/** Emails everyone in the group who can manage members. Best effort: never fails the request. */
async function alertMembership(slug: string, name: string, message: string | null) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: g } = await admin.from("groups" as never).select("id, name").eq("slug" as never, slug as never).maybeSingle();
    const group = g as unknown as { id: string; name: string } | null;
    if (!group) return;
    const { data: rows } = await admin
      .from("group_members" as never)
      .select("profile_id, base_role, tasks")
      .eq("group_id" as never, group.id as never)
      .eq("status" as never, "active" as never);
    const ids = ((rows as unknown as { profile_id: string; base_role: string; tasks: string[] }[]) ?? [])
      .filter((r) => r.base_role === "lead" || r.tasks.includes("membership"))
      .map((r) => r.profile_id);
    if (!ids.length) return;
    const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("active", true);
    const html = joinRequestAlertHtml({ groupName: group.name, name, message, membersUrl: `${SITE_URL}/admin/users` });
    for (const p of (active as { id: string }[]) ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      if (u?.user?.email) await sendEmail({ to: u.user.email, subject: `${name} would like to join ${group.name}`, html });
    }
  } catch {
    // the request still shows on the Members page
  }
}

export async function submitJoinRequest(_prev: JoinState, fd: FormData): Promise<JoinState> {
  // honeypot: people never see or fill this field
  if (str(fd, "company_fax")) return { ok: true };
  const slug = str(fd, "group");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const message = str(fd, "message");
  if (name.length < 2) return { error: "Please give your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That doesn't look like an email address." };
  if (message.length > 2000) return { error: "Please keep the message under 2,000 characters." };
  if (fd.get("privacy") !== "on") return { error: "Please tick the box to say the group may contact you." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const salt = process.env.ADOPTION_IP_SALT ?? process.env.CRON_SECRET ?? "riverhub";
  const ipHash = ip ? createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32) : null;

  const { error } = await createPublicClient().rpc("submit_join_request" as never, {
    p_group_slug: slug, p_name: name, p_email: email, p_message: message || null, p_ip_hash: ipHash,
  } as never);
  if (error) {
    const k = Object.keys(ERRORS).find((key) => error.message.includes(key));
    return { error: k ? ERRORS[k] : "Your request couldn't be sent just now. Please try again." };
  }
  await alertMembership(slug, name, message || null);
  return { ok: true };
}
