// Transactional email via Resend. If RESEND_API_KEY / RESEND_FROM are unset, callers fall back
// to Supabase's built-in emails. Env: RESEND_API_KEY, RESEND_FROM ("River Hub <no-reply@domain>"),
// optional RESEND_REPLY_TO.

import { INSTANCE } from "@/lib/instance";

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

const APP = "River Hub";
const ORG = INSTANCE.orgName;

function shell(title: string, intro: string, ctaLabel: string, link: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#176577;padding:20px 28px;color:#fff;font-size:18px;font-weight:700">${APP} · ${ORG}</td></tr>
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

export function inviteEmailHtml(link: string): string {
  return shell(
    `You've been invited to ${APP}`,
    `${ORG} uses ${APP} to track river water quality and sewage spills on the ${INSTANCE.riverName}. You've been invited to join — set your password to get started.`,
    "Accept invitation",
    link,
    "This invitation was sent by an administrator. If you weren't expecting it, you can ignore this email.",
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
