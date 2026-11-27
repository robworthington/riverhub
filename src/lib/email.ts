// Transactional email via Resend. If RESEND_API_KEY / RESEND_FROM are unset, callers fall back
// to Supabase's built-in emails. Env: RESEND_API_KEY, RESEND_FROM ("River Hub <no-reply@domain>"),
// optional RESEND_REPLY_TO.

import { INSTANCE, MODE } from "@/lib/instance";

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return { ok: false, error: "email not configured" };
  const body: Record<string, unknown> = { from, to: opts.to, subject: opts.subject, html: opts.html };
  if (process.env.RESEND_REPLY_TO) body.reply_to = process.env.RESEND_REPLY_TO;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const APP = "River Hub";
// the national deploy serves every river, so its emails carry no single group's name by default
const ORG = MODE === "national" ? APP : INSTANCE.orgName;

function shell(title: string, intro: string, ctaLabel: string, link: string, footer: string, org: string = ORG): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#176577;padding:20px 28px;color:#fff;font-size:18px;font-weight:700">${org === APP ? APP : `${APP} · ${esc(org)}`}</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${title}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155">${intro}</p>
          <a href="${link}" style="display:inline-block;background:#176577;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">${ctaLabel}</a>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">${footer}</p>
          <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">Or paste this link into your browser:<br>${link}</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** `river` is the inviting member's river (memberRiver); the build-time default is only a fallback. */
export function inviteEmailHtml(link: string, river?: { groupName: string; riverName: string }): string {
  const org = river?.groupName ?? ORG;
  return shell(
    `You've been invited to ${APP}`,
    `${esc(org)} uses ${APP} to track river water quality and sewage spills on the ${esc(river?.riverName ?? INSTANCE.riverName)}. You've been invited to join — set your password to get started.`,
    "Accept invitation",
    link,
    "This invitation was sent by an administrator. If you weren't expecting it, you can ignore this email.",
    org,
  );
}

export function resetEmailHtml(link: string): string {
  return shell(
    `Reset your ${APP} password`,
    `A password reset was requested for your ${APP} account. Click below to choose a new password.`,
    "Reset password",
    link,
    "If you didn't request this, you can safely ignore this email — your password won't change.",
  );
}

// ---------- adopt a river (migration 0107) ----------


/** To moderators: a new request is waiting. */
export function adoptionAlertHtml(o: { groupName: string; riverName: string; contactName: string; queueUrl: string }): string {
  return shell(
    `New request to adopt the ${esc(o.riverName)}`,
    `${esc(o.groupName)} (contact: ${esc(o.contactName)}) has asked to look after the ${esc(o.riverName)} on ${APP}. Review it in the adoption queue.`,
    "Review the request",
    o.queueUrl,
    "You're receiving this because you're a River Hub moderator.",
  );
}

/** To the applicant: we've got it. */
export function adoptionReceivedHtml(o: { groupName: string; riverName: string; riverUrl: string }): string {
  return shell(
    `Thanks for offering to adopt the ${esc(o.riverName)}`,
    `We've received ${esc(o.groupName)}'s request to look after the ${esc(o.riverName)} on ${APP}. A River Hub moderator will review it, usually within a week, and email you either way.`,
    "See the river on River Hub",
    o.riverUrl,
    `If you didn't send this request, you can ignore this email, or tell us at hello@riverhub.org.`,
  );
}

/** To the applicant on approval, with their invitation to set a password (new account). */
export function adoptionApprovedInviteHtml(o: { groupName: string; riverName: string; link: string }): string {
  return shell(
    `${esc(o.groupName)} now looks after the ${esc(o.riverName)}`,
    `Your request has been approved. The ${esc(o.riverName)}'s pages on ${APP} now name ${esc(o.groupName)}, and you're its first admin. Set your password to sign in, invite your volunteers and start filling the gaps.`,
    "Set your password",
    o.link,
    "This invitation was sent by a River Hub moderator after reviewing your request.",
  );
}

/** To the applicant on approval when they already have an account. */
export function adoptionApprovedExistingHtml(o: { groupName: string; riverName: string; link: string }): string {
  return shell(
    `${esc(o.groupName)} now looks after the ${esc(o.riverName)}`,
    `Your request has been approved, and the ${esc(o.riverName)} has been added to your ${APP} account with admin access. Use the river switcher at the top of the members' area to move to it.`,
    "Sign in",
    o.link,
    "Sent by a River Hub moderator after reviewing your request.",
  );
}

/** To the applicant when a moderator declines. */
export function adoptionDeclinedHtml(o: { groupName: string; riverName: string; note: string | null; riverUrl: string }): string {
  return shell(
    `About your request to adopt the ${esc(o.riverName)}`,
    `Thank you for ${esc(o.groupName)}'s request. We haven't been able to approve it this time.${o.note ? ` ${esc(o.note)}` : ""} If you'd like to talk it through, reply to this email or write to hello@riverhub.org.`,
    "See the river on River Hub",
    o.riverUrl,
    "Sent by a River Hub moderator.",
  );
}

// ---------- photo reports (migration 0110) ----------

/** To the river's admins and moderators: a photo has been reported. */
export function photoReportAlertHtml(o: { riverName: string; caption: string; reason: string; hidden: boolean; reviewUrl: string }): string {
  return shell(
    `A ${esc(o.riverName)} photo has been reported`,
    `Someone reported the photo &ldquo;${esc(o.caption)}&rdquo;: ${esc(o.reason)}.${o.hidden ? " It has been taken off the public pages until someone reviews it." : ""} Keep it or hide it from the Photos page.`,
    "Review the report",
    o.reviewUrl,
    "You're receiving this because you're an admin of this river on River Hub, or a River Hub moderator.",
  );
}

// ---------- group invitations and join requests (migration 0129) ----------

const ROLE_WORD: Record<string, string> = { lead: "a lead", coordinator: "a coordinator", volunteer: "a volunteer", viewer: "a viewer" };

/** A new person: the link sets their password, then takes them to accept the invitation. */
export function groupInviteNewHtml(o: { link: string; groupName: string; riverName: string; role: string; inviter: string | null }): string {
  return shell(
    `Join ${esc(o.groupName)} on ${APP}`,
    `${o.inviter ? `${esc(o.inviter)} has` : "You've been"} invited you to join ${esc(o.groupName)} as ${ROLE_WORD[o.role] ?? "a member"}. ${esc(o.groupName)} uses ${APP} to record water quality and track sewage spills on the ${esc(o.riverName)}. Set a password to get started.`,
    "Accept the invitation",
    o.link,
    "The invitation lasts 14 days. If you weren't expecting it, you can ignore this email.",
    o.groupName,
  );
}

/** Someone who already has an account: sign in and accept. */
export function groupInviteExistingHtml(o: { link: string; groupName: string; riverName: string; role: string; inviter: string | null }): string {
  return shell(
    `Join ${esc(o.groupName)} on ${APP}`,
    `${o.inviter ? `${esc(o.inviter)} has` : "You've been"} invited you to join ${esc(o.groupName)} on the ${esc(o.riverName)} as ${ROLE_WORD[o.role] ?? "a member"}. Sign in with your ${APP} account to accept.`,
    "Accept the invitation",
    o.link,
    "The invitation lasts 14 days. If you weren't expecting it, you can ignore this email.",
    o.groupName,
  );
}

/** To people with the membership task: someone asked to join from the group's public page. */
export function joinRequestAlertHtml(o: { groupName: string; name: string; message: string | null; membersUrl: string }): string {
  return shell(
    `${esc(o.name)} would like to join ${esc(o.groupName)}`,
    `${esc(o.name)} asked to join ${esc(o.groupName)} from its page on ${APP}.${o.message ? ` They wrote: "${esc(o.message.slice(0, 400))}"` : ""} Invite them, or decline, on the Members page.`,
    "Open the Members page",
    o.membersUrl,
    "You're receiving this because you can manage members of this group.",
    o.groupName,
  );
}
