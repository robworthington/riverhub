"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTask } from "@/lib/auth";

type Res = { error?: string; ok?: boolean };

const ERRORS: Record<string, string> = {
  needs_comms: "You need the comms task to change the group's name and links.",
  needs_settings: "You need the settings task to change result approval.",
  name_required: "The group needs a name.",
  news_too_long: "Keep the news line to 200 characters.",
  publish_needs_approval: "Switch result approval on before publishing, so only reviewed results go public.",
  not_allowed: "You're not working as a member of a group.",
};

function cleanUrl(v: string): string | null {
  const s = v.trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Save the group profile (comms task) and/or result approval (settings task). update_group() checks both. */
export async function saveGroup(input: {
  name?: string; logoUrl?: string; websiteUrl?: string; donateUrl?: string; resultsNeedApproval?: boolean;
  publishResults?: boolean; news?: string;
}): Promise<Res> {
  const me = await requireTask("comms", "settings");
  const canComms = !!me.tasks?.includes("comms");
  const canSettings = !!me.tasks?.includes("settings");
  const urls: Record<string, string | null> = {};
  for (const [k, v] of [["logo", input.logoUrl], ["website", input.websiteUrl], ["donate", input.donateUrl]] as const) {
    if (!canComms || v === undefined) { urls[k] = null; continue; }
    const c = cleanUrl(v);
    if (c === null) return { error: `That ${k} link doesn't look like a web address.` };
    urls[k] = c;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_group" as never, {
    p_name: canComms ? (input.name ?? null) : null,
    p_logo_url: urls.logo,
    p_website_url: urls.website,
    p_donate_url: urls.donate,
    p_results_need_approval: canSettings ? (input.resultsNeedApproval ?? null) : null,
    p_publish_results: canSettings ? (input.publishResults ?? null) : null,
    p_news: canComms ? (input.news ?? null) : null,
  } as never);
  if (error) {
    const k = Object.keys(ERRORS).find((key) => error.message.includes(key));
    return { error: k ? ERRORS[k] : error.message };
  }
  revalidatePath("/admin/group");
  revalidateTag("public-rpc");
  revalidatePath("/", "layout");
  return { ok: true };
}
