"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/server";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/photos";
import { unpublishPhoto, photoPagePaths } from "@/lib/photoPublish";
import { emailConfigured, sendEmail, photoReportAlertHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export type ReportState = { ok?: boolean; hidden?: boolean; error?: string };

const siteUrl = () => SITE_URL;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const ERRORS: Record<string, string> = {
  photo_not_found: "That photo is no longer on River Hub.",
  already_reported: "You've already reported this photo. The river's admins will review it.",
  rate_limited: "Too many reports from here today. Please try again tomorrow, or email hello@riverhub.org.",
};

/** Email the river's admins and every moderator. Best effort. */
async function alert(orgId: string, caption: string, reason: string, hidden: boolean) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const [{ data: org }, { data: admins }, { data: mods }] = await Promise.all([
      admin.from("organisations").select("river_name").eq("id", orgId).single(),
      admin.from("profile_orgs" as never).select("profile_id").eq("organisation_id" as never, orgId as never).eq("role" as never, "admin" as never),
      admin.from("profiles").select("id").eq("moderator" as never, true as never).eq("active", true),
    ]);
    const ids = new Set([
      ...((admins as unknown as { profile_id: string }[]) ?? []).map((a) => a.profile_id),
      ...((mods as { id: string }[]) ?? []).map((m) => m.id),
    ]);
    const riverName = (org as { river_name: string | null } | null)?.river_name ?? "river";
    const html = photoReportAlertHtml({ riverName, caption, reason, hidden, reviewUrl: `${siteUrl()}/photos` });
    for (const id of ids) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (u?.user?.email) await sendEmail({ to: u.user.email, subject: `Photo reported: ${riverName}`, html });
    }
  } catch {
    // the report is still on the Photos page
  }
}

export async function submitPhotoReport(_prev: ReportState, fd: FormData): Promise<ReportState> {
  if (str(fd, "company_fax")) return { ok: true }; // honeypot
  const photoId = str(fd, "photo");
  const reason = str(fd, "reason") as ReportReason;
  if (!(reason in REPORT_REASON_LABEL)) return { error: "Choose what's wrong with the photo." };
  const note = str(fd, "note").slice(0, 1000);
  const email = str(fd, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email address doesn't look right (or leave it blank)." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const salt = process.env.ADOPTION_IP_SALT ?? process.env.CRON_SECRET ?? "riverhub";
  const ipHash = ip ? createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32) : null;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("submit_photo_report" as never, {
    p_photo: photoId, p_reason: reason, p_note: note, p_email: email, p_ip_hash: ipHash,
  } as never);
  if (error) {
    const code = Object.keys(ERRORS).find((k) => error.message.includes(k));
    return { error: code ? ERRORS[code] : "The report couldn't be sent just now. Please try again, or email hello@riverhub.org." };
  }
  const res = data as unknown as { organisation_id: string; auto_hidden: boolean };

  // Hidden by the reports: remove the public copy now (the database has already unlisted it).
  let caption = "";
  try {
    const admin = createAdminClient();
    const { data: p } = await admin.from("river_photos").select("*").eq("id", photoId).single();
    if (p) {
      caption = (p as { caption: string }).caption;
      if (res.auto_hidden) {
        await unpublishPhoto(admin, p as never, { hidden_by_reports: true });
        for (const path of await photoPagePaths(admin, res.organisation_id, (p as { asset_id: string | null }).asset_id)) revalidatePath(path);
      }
    }
  } catch {
    // the photo is already off the public lists; the file is removed when someone reviews it
  }
  await alert(res.organisation_id, caption, REPORT_REASON_LABEL[reason], res.auto_hidden);
  return { ok: true, hidden: res.auto_hidden };
}
