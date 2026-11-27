import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { emailConfigured, sendEmail, groupInviteNewHtml, groupInviteExistingHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import type { BaseRole } from "@/lib/tasks";

type Res = { error?: string; ok?: boolean; note?: string };

/**
 * Email an invitation link (migration 0129). Someone new gets a Supabase invite that sets their
 * password and then lands on /auth/accept, which lists their invitations; someone with an account
 * gets a link straight to /auth/accept?token=…, where they sign in and accept.
 * Returns a note (and the link) when the email couldn't be sent, so it can be passed on by hand.
 */
export type InviteTemplates = {
  subject?: string;
  /** For someone new: the link sets their password. */
  newHtml?: (link: string) => string;
  /** For someone with an account: the link opens the invitation. */
  existingHtml?: (link: string) => string;
};

export async function sendInvitation(email: string, token: string, role: BaseRole,
  ctx: { groupName: string; riverName: string; inviter: string | null }, t: InviteTemplates = {}): Promise<Res> {
  const subject = t.subject ?? `Join ${ctx.groupName} on River Hub`;
  const admin = createAdminClient();
  const acceptLink = `${SITE_URL}/auth/accept?token=${encodeURIComponent(token)}`;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  const confirmed = !!existing?.email_confirmed_at;

  if (confirmed) {
    if (!emailConfigured()) return { ok: true, note: `Email isn't set up here: send them this link yourself: ${acceptLink}` };
    const sent = await sendEmail({ to: email, subject, html: t.existingHtml ? t.existingHtml(acceptLink) : groupInviteExistingHtml({ link: acceptLink, role, ...ctx }) });
    return sent.ok ? { ok: true } : { ok: true, note: `Invitation saved but the email failed (${sent.error}). Their link: ${acceptLink}` };
  }

  // new (or never-confirmed) address: a Supabase invite sets the password, then /accept-invite sends them on
  const redirectTo = `${SITE_URL}/accept-invite`;
  if (emailConfigured()) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    const link = data?.properties?.action_link;
    if (error || !link) return { ok: true, note: `Invitation saved but the sign-up link couldn't be made (${error?.message ?? "no link"}).` };
    const sent = await sendEmail({ to: email, subject, html: t.newHtml ? t.newHtml(link) : groupInviteNewHtml({ link, role, ...ctx }) });
    return sent.ok ? { ok: true } : { ok: true, note: `Invitation saved but the email failed: ${sent.error}` };
  }
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  return error ? { ok: true, note: `Invitation saved but the email failed: ${error.message}` } : { ok: true };
}

