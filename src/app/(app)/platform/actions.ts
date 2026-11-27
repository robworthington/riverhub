"use server";

// The owner's onboarding actions (migration 0131). Every database function re-checks that the caller
// is the site owner; requireOwner here only redirects anyone else early.

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { sendInvitation } from "@/lib/invitations";
import { BASE_ROLES, type BaseRole } from "@/lib/tasks";

type Res = { ok?: boolean; error?: string; note?: string };

const ERRORS: Record<string, string> = {
  not_owner: "Only the River Hub owner can do that.",
  river_not_found: "River not found.",
  name_required: "Give the group a name.",
  bad_slug: "The web address may use only lower-case letters, numbers and single hyphens (e.g. friends-of-the-tamar).",
  slug_taken: "Another group already uses that web address.",
  not_attached: "That group doesn't work on that river.",
  already_member: "They're already in the group.",
  not_allowed: "You can't invite to that group.",
};
const friendly = (m: string) => ERRORS[Object.keys(ERRORS).find((k) => m.includes(k)) ?? ""] ?? m;

function refresh() {
  revalidatePath("/platform/rivers");
  revalidatePath("/platform/groups");
}

/** Take a river live or offline, then refresh its row in the national summary so the home page shows it now. */
export async function setLive(orgId: string, live: boolean): Promise<Res> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_live" as never, { p_org: orgId, p_live: live } as never);
  if (error) return { error: friendly(error.message) };
  let note: string | undefined;
  const { error: rErr } = await createAdminClient().rpc("refresh_national_record" as never, { p_limit: 1, p_org: orgId } as never);
  if (rErr) note = "Done. The national summary will catch up at the next hourly refresh.";
  refresh();
  revalidateTag("public-rpc");
  revalidatePath("/", "layout");
  return { ok: true, note };
}

export async function createGroup(input: { name: string; slug: string; website: string; orgId?: string }): Promise<Res> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_create_group" as never, {
    p_name: input.name, p_slug: input.slug, p_website: input.website || null, p_org: input.orgId || null,
  } as never);
  if (error) return { error: friendly(error.message) };
  refresh();
  if (input.orgId) revalidateTag("public-rpc");
  return { ok: true };
}

export async function attachGroup(groupId: string, orgId: string): Promise<Res> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_attach" as never, { p_group: groupId, p_org: orgId } as never);
  if (error) return { error: friendly(error.message) };
  refresh();
  revalidateTag("public-rpc");
  return { ok: true };
}

export async function detachGroup(groupId: string, orgId: string): Promise<Res> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_detach" as never, { p_group: groupId, p_org: orgId } as never);
  if (error) return { error: friendly(error.message) };
  refresh();
  revalidateTag("public-rpc");
  return { ok: true };
}

/** Invite someone (usually the lead) to a group on one of its rivers, and email them. */
export async function inviteToGroup(input: { groupId: string; orgId: string; email: string; name: string; role: BaseRole }): Promise<Res> {
  const me = await requireOwner();
  if (!BASE_ROLES.includes(input.role)) return { error: "Unknown role." };
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That doesn't look like an email address." };
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("platform_invite" as never, {
    p_group: input.groupId, p_org: input.orgId, p_email: email, p_full_name: input.name || null, p_base_role: input.role,
  } as never);
  if (error) return { error: friendly(error.message) };
  const admin = createAdminClient();
  const [{ data: g }, { data: o }] = await Promise.all([
    admin.from("groups" as never).select("name").eq("id" as never, input.groupId as never).maybeSingle(),
    admin.from("organisations").select("river_name, name").eq("id", input.orgId).maybeSingle(),
  ]);
  const groupName = (g as unknown as { name: string } | null)?.name ?? "the group";
  const riverName = (o as { river_name: string | null; name: string } | null)?.river_name ?? "river";
  const res = await sendInvitation(email, token as unknown as string, input.role, { groupName, riverName, inviter: me.full_name });
  refresh();
  return res;
}
