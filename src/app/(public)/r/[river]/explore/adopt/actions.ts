"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveRiver } from "@/lib/river";
import { riverPath } from "@/lib/river-context";
import { SUBMIT_ERROR, type GroupKind, GROUP_KIND_LABEL } from "@/lib/adoption";
import { emailConfigured, sendEmail, adoptionAlertHtml, adoptionReceivedHtml } from "@/lib/email";

export type SubmitState = { ok?: boolean; error?: string };

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Emails every active moderator. Best effort: a failed alert never fails the submission. */
async function alertModerators(groupName: string, riverName: string, contactName: string) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("id").eq("moderator" as never, true as never).eq("active", true);
    const html = adoptionAlertHtml({ groupName, riverName, contactName, queueUrl: `${siteUrl()}/admin/adoptions` });
    for (const p of (data as { id: string }[]) ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      if (u?.user?.email) await sendEmail({ to: u.user.email, subject: `Adoption request: ${riverName}`, html });
    }
  } catch {
    // the queue badge still shows the request
  }
}

export async function submitAdoption(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  // Honeypot: real people never see or fill this field. Pretend it worked.
  if (str(fd, "company_fax")) return { ok: true };

  const river = await resolveRiver(str(fd, "river"));
  if (!river) return { error: SUBMIT_ERROR.river_not_found };

  const kind = str(fd, "group_kind") as GroupKind;
  if (!(kind in GROUP_KIND_LABEL)) return { error: "Choose what kind of group you are." };
  if (fd.get("authorised") !== "on" || fd.get("accuracy") !== "on" || fd.get("privacy") !== "on") {
    return { error: "Please tick the three boxes at the end of the form." };
  }
  let website = str(fd, "website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const about = str(fd, "about");
  if (about.length < 30) return { error: "Tell us a little more about your group's work on the river (at least a sentence or two)." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const salt = process.env.ADOPTION_IP_SALT ?? process.env.CRON_SECRET ?? "riverhub";
  const ipHash = ip ? createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32) : null;

  const groupName = str(fd, "group_name");
  const contactName = str(fd, "contact_name");
  const email = str(fd, "email");
  const supabase = createPublicClient();
  const { error } = await supabase.rpc("submit_adoption_request" as never, {
    p_org: river.orgId,
    p_group_name: groupName,
    p_group_kind: kind,
    p_charity_number: str(fd, "charity_number"),
    p_website: website,
    p_contact_name: contactName,
    p_contact_role: str(fd, "contact_role"),
    p_email: email,
    p_phone: str(fd, "phone"),
    p_about: about,
    p_how_heard: str(fd, "how_heard"),
    p_ip_hash: ipHash,
  } as never);
  if (error) {
    const code = Object.keys(SUBMIT_ERROR).find((k) => error.message.includes(k));
    if (code) return { error: SUBMIT_ERROR[code] };
    if (error.code === "23514") return { error: "Something in the form doesn't look right. Check the email address, website and lengths, then try again." };
    return { error: "Your request couldn't be sent just now. Please try again, or email hello@riverhub.org." };
  }

  const riverName = river.riverName ?? "river";
  await alertModerators(groupName, riverName, contactName);
  if (emailConfigured()) {
    await sendEmail({
      to: email,
      subject: `Your request to adopt the ${riverName}`,
      html: adoptionReceivedHtml({ groupName, riverName, riverUrl: `${siteUrl()}${riverPath(river.slug, "/explore/spills")}` }),
    });
  }
  return { ok: true };
}
