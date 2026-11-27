"use server";

import { revalidatePath } from "next/cache";
import { requireEditor, requireProfile, requireTask } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_BUCKET, photoPaths, type PhotoLicence } from "@/lib/photos";
import { publishPhoto, unpublishPhoto } from "@/lib/photoPublish";

// Server actions for river photos. Row-level security (migration 0099) is the real gate: uploads start
// pending, only admins approve/hide/edit, and the public bucket only takes writes from admins.

type Result = { error?: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function activeOrg(p: { active_organisation_id: string | null; organisation_id: string }) {
  return p.active_organisation_id ?? p.organisation_id;
}

/** Refresh the members' page and the river's public pages that show photos. */
async function revalidateAll(orgId: string, assetId?: string | null) {
  revalidatePath("/photos");
  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("river_slug").eq("id", orgId).single();
  if (data?.river_slug) {
    revalidatePath(`/r/${data.river_slug}/explore/spills`);
    if (assetId) revalidatePath(`/r/${data.river_slug}/explore/spills/${assetId}`);
  }
}

/** Record a photo whose cleaned files the browser has already uploaded to the evidence bucket. */
export async function createPhoto(input: {
  id: string; caption: string; place: string; takenOn: string; credit: string; licence: PhotoLicence;
  consent: boolean; assetId: string | null; width: number; height: number;
}): Promise<Result> {
  const profile = await requireEditor();
  if (!UUID_RE.test(input.id)) return { error: "Bad photo reference." };
  if (!input.caption.trim()) return { error: "Add a caption saying what the photo shows." };
  if (!input.credit.trim()) return { error: "Add a credit." };
  if (!input.consent) return { error: "Please confirm you took the photo and anyone identifiable agreed." };
  if (input.takenOn && !DATE_RE.test(input.takenOn)) return { error: "That date isn't valid." };
  if (input.licence !== "cc_by_4" && input.licence !== "river_hub_only") return { error: "Choose a licence." };
  const org = activeOrg(profile);
  const paths = photoPaths(org, input.id);
  const supabase = await createClient();
  const { error } = await supabase.from("river_photos").insert({
    id: input.id,
    organisation_id: org,
    asset_id: input.assetId || null,
    caption: input.caption.trim(),
    place: input.place.trim() || null,
    taken_on: input.takenOn || null,
    credit: input.credit.trim(),
    licence: input.licence,
    consent: true,
    private_path: paths.privateLarge,
    thumb_private_path: paths.privateThumb,
    width: input.width,
    height: input.height,
    uploaded_by: profile.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/photos");
  return {};
}

/** Approve: copy the cleaned files into the public bucket, then mark the photo public. */
export async function approvePhoto(id: string): Promise<Result> {
  await requireTask("photos");
  const supabase = await createClient();
  const { data: p, error: readErr } = await supabase.from("river_photos").select("*").eq("id", id).single();
  if (readErr || !p) return { error: readErr?.message ?? "Photo not found." };
  const { data: me } = await supabase.auth.getUser();
  const err = await publishPhoto(supabase, p, me.user?.id ?? null);
  if (err) return { error: err };
  await revalidateAll(p.organisation_id, p.asset_id);
  return {};
}

/** Hide: take it off the public pages and remove the public copy (the private copy stays). */
export async function hidePhoto(id: string): Promise<Result> {
  await requireTask("photos");
  const supabase = await createClient();
  const { data: p } = await supabase.from("river_photos").select("*").eq("id", id).single();
  if (!p) return { error: "Photo not found." };
  const err = await unpublishPhoto(supabase, p);
  if (err) return { error: err };
  await revalidateAll(p.organisation_id, p.asset_id);
  return {};
}

/**
 * Close a photo's open reports (migration 0110). "kept" puts it back on the public pages if the reports
 * had hidden it; "hidden" takes it down. For the river's own admins.
 */
export async function resolvePhotoReports(id: string, outcome: "kept" | "hidden"): Promise<Result> {
  await requireTask("photos");
  const supabase = await createClient();
  const { data: p } = await supabase.from("river_photos").select("*").eq("id", id).single();
  if (!p) return { error: "Photo not found." };
  const { error } = await supabase.rpc("resolve_photo_reports" as never, { p_photo: id, p_outcome: outcome } as never);
  if (error) return { error: error.message };
  let err: string | null = null;
  if (outcome === "kept" && p.status === "hidden" && (p as { hidden_by_reports?: boolean }).hidden_by_reports) {
    const { data: me } = await supabase.auth.getUser();
    err = await publishPhoto(supabase, p, me.user?.id ?? null);
  } else if (outcome === "hidden" && p.status === "approved") {
    err = await unpublishPhoto(supabase, p);
  }
  if (err) return { error: err };
  await revalidateAll(p.organisation_id, p.asset_id);
  return {};
}

export async function setHero(id: string, hero: boolean): Promise<Result> {
  await requireTask("photos");
  const supabase = await createClient();
  const { data: p } = await supabase.from("river_photos").select("organisation_id, status, asset_id").eq("id", id).single();
  if (!p) return { error: "Photo not found." };
  if (hero && p.status !== "approved") return { error: "Approve the photo before making it the river's lead photo." };
  const { error } = await supabase.from("river_photos").update({ is_hero: hero }).eq("id", id);
  if (error) return { error: error.message };
  await revalidateAll(p.organisation_id, p.asset_id);
  return {};
}

export async function editPhoto(id: string, input: { caption: string; place: string; takenOn: string; credit: string; assetId: string | null }): Promise<Result> {
  await requireTask("photos");
  if (!input.caption.trim() || !input.credit.trim()) return { error: "Caption and credit can't be empty." };
  if (input.takenOn && !DATE_RE.test(input.takenOn)) return { error: "That date isn't valid." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("river_photos").select("organisation_id, asset_id").eq("id", id).single();
  if (!p) return { error: "Photo not found." };
  const { error } = await supabase.from("river_photos").update({
    caption: input.caption.trim(), place: input.place.trim() || null, taken_on: input.takenOn || null,
    credit: input.credit.trim(), asset_id: input.assetId || null,
  }).eq("id", id);
  if (error) return { error: error.message };
  await revalidateAll(p.organisation_id, p.asset_id);
  if (input.assetId && input.assetId !== p.asset_id) await revalidateAll(p.organisation_id, input.assetId);
  return {};
}

/** Delete: admins any photo; the uploader their own while it's still pending. Removes every copy. */
export async function deletePhoto(id: string): Promise<Result> {
  await requireProfile();
  const supabase = await createClient();
  const { data: p } = await supabase.from("river_photos").select("*").eq("id", id).single();
  if (!p) return { error: "Photo not found." };
  const { error, count } = await supabase.from("river_photos").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: error.message };
  if (!count) return { error: "You can't delete this photo. Ask a group admin." };
  await supabase.storage.from("evidence").remove([p.private_path, p.thumb_private_path]);
  const pub = [p.public_path, p.thumb_public_path].filter((x): x is string => !!x);
  if (pub.length) await supabase.storage.from(PUBLIC_BUCKET).remove(pub);
  await revalidateAll(p.organisation_id, p.asset_id);
  return {};
}
