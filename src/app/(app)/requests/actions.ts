"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addWorkingDays, authorityBySlug, bankHolidays, CLOSED_STATUSES, EIR_EXTENDED_WORKING_DAYS,
  RESPONSE_WORKING_DAYS, templateByKey,
} from "@/lib/requests";
import type { InfoRequestLaw, InfoRequestLayer, InfoRequestRoute, InfoRequestStatus } from "@/lib/types";

// Server actions for the EIR / FOI request log. Row-level security (migration 0098) does the real
// enforcement: members only ever touch their active river's requests, viewers can't write, and only
// admins can publish or delete. These checks just fail early with a clear message.

type Result = { error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WDTK_RE = /^https:\/\/(www\.)?whatdotheyknow\.com\/request\//;

function activeOrg(profile: { active_organisation_id: string | null; organisation_id: string }): string {
  return profile.active_organisation_id ?? profile.organisation_id;
}

function revalidate(id?: string) {
  revalidatePath("/requests");
  if (id) revalidatePath(`/requests/${id}`);
}

export async function createRequest(input: {
  authoritySlug: string | null;
  authority: string;
  law: InfoRequestLaw;
  route: InfoRequestRoute;
  template: string | null;
  layer: InfoRequestLayer;
  title: string;
  body: string;
  assetIds: string[];
}): Promise<Result> {
  const profile = await requireEditor();
  const title = input.title.trim();
  const authority = input.authority.trim();
  if (!title) return { error: "Give the request a title." };
  if (!authority) return { error: "Choose who the request is to." };
  if (input.template && !templateByKey(input.template)) return { error: "Unknown template." };
  if (input.authoritySlug && !authorityBySlug(input.authoritySlug)) return { error: "Unknown authority." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("info_requests")
    .insert({
      organisation_id: activeOrg(profile),
      authority,
      authority_slug: input.authoritySlug,
      law: input.law,
      route: input.route,
      template: input.template,
      layer: input.layer,
      title,
      body: input.body.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save the request." };

  if (input.assetIds.length) {
    const { error: linkErr } = await supabase
      .from("info_request_assets")
      .insert(input.assetIds.map((asset_id) => ({ request_id: data.id, asset_id })));
    if (linkErr) return { error: `Saved, but linking overflows failed: ${linkErr.message}` };
  }
  revalidate();
  redirect(`/requests/${data.id}`);
}

/** Record that the request has gone, and work out when the reply is due (20 working days). */
export async function markSent(id: string, input: { sentOn: string; wdtkUrl: string; authorityRef: string }): Promise<Result> {
  await requireEditor();
  if (!DATE_RE.test(input.sentOn)) return { error: "Enter the date it was sent." };
  const wdtk = input.wdtkUrl.trim();
  if (wdtk && !WDTK_RE.test(wdtk)) return { error: "That isn't a WhatDoTheyKnow request link (it should start https://www.whatdotheyknow.com/request/)." };
  const due = addWorkingDays(input.sentOn, RESPONSE_WORKING_DAYS, await bankHolidays());
  const supabase = await createClient();
  const { error } = await supabase
    .from("info_requests")
    .update({ status: "sent", sent_on: input.sentOn, due_on: due, wdtk_url: wdtk || null, authority_ref: input.authorityRef.trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

/** Move a sent request on: acknowledged, extended (EIR: 40 working days), answered, refused … */
export async function updateStatus(id: string, status: InfoRequestStatus, date: string | null): Promise<Result> {
  await requireEditor();
  if (status === "draft") return { error: "A sent request can't go back to draft." };
  if (date && !DATE_RE.test(date)) return { error: "That date isn't valid." };
  const supabase = await createClient();
  const { data: current, error: readErr } = await supabase
    .from("info_requests").select("sent_on, law").eq("id", id).single();
  if (readErr || !current) return { error: readErr?.message ?? "Request not found." };

  const patch: { status: InfoRequestStatus; extended_to?: string | null; answered_on?: string | null } = { status };
  if (status === "extended") {
    if (current.law !== "eir") return { error: "Only EIR requests can be extended to 40 working days. Under FOI, log the authority's new date as a note." };
    if (!current.sent_on) return { error: "Record when the request was sent first." };
    patch.extended_to = addWorkingDays(current.sent_on, EIR_EXTENDED_WORKING_DAYS, await bankHolidays());
  }
  if (CLOSED_STATUSES.includes(status) && status !== "withdrawn") {
    patch.answered_on = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  }
  const { error } = await supabase.from("info_requests").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

export async function updateDetails(id: string, input: { title: string; body: string; authorityRef: string; wdtkUrl: string; notes: string }): Promise<Result> {
  await requireEditor();
  const title = input.title.trim();
  if (!title) return { error: "The title can't be empty." };
  const wdtk = input.wdtkUrl.trim();
  if (wdtk && !WDTK_RE.test(wdtk)) return { error: "That isn't a WhatDoTheyKnow request link." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("info_requests")
    .update({ title, body: input.body.trim() || null, authority_ref: input.authorityRef.trim() || null, wdtk_url: wdtk || null, notes: input.notes.trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

export async function addNote(id: string, note: string): Promise<Result> {
  const profile = await requireEditor();
  const text = note.trim();
  if (!text) return { error: "Write a note first." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("info_request_events")
    .insert({ request_id: id, organisation_id: activeOrg(profile), kind: "note", note: text, created_by: profile.id });
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

/** Register a file the browser has already uploaded to evidence/requests/<id>/… */
export async function addDocument(id: string, input: { storagePath: string; fileName: string; kind: "letter" | "reply" | "attachment" | "other" }): Promise<Result> {
  const profile = await requireEditor();
  if (!input.storagePath.startsWith(`requests/${id}/`)) return { error: "Unexpected upload location." };
  const org = activeOrg(profile);
  const supabase = await createClient();
  const { error } = await supabase
    .from("info_request_documents")
    .insert({ request_id: id, organisation_id: org, kind: input.kind, storage_path: input.storagePath, file_name: input.fileName, uploaded_by: profile.id });
  if (error) return { error: error.message };
  await supabase
    .from("info_request_events")
    .insert({ request_id: id, organisation_id: org, kind: "document", note: `${input.kind === "reply" ? "Reply" : "Document"} added: ${input.fileName}`, created_by: profile.id });
  revalidate(id);
  return {};
}

export async function setDataLoaded(id: string, loaded: boolean): Promise<Result> {
  await requireEditor();
  const supabase = await createClient();
  const { error } = await supabase.from("info_requests").update({ data_loaded: loaded }).eq("id", id);
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

/** Show (or hide) the request on the river's public pages. Admins only; the database enforces it too. */
export async function setPublic(id: string, isPublic: boolean): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("info_requests").update({ is_public: isPublic }).eq("id", id);
  if (error) return { error: error.message };
  revalidate(id);
  return {};
}

export async function deleteRequest(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: docs } = await supabase.from("info_request_documents").select("storage_path").eq("request_id", id);
  const { error } = await supabase.from("info_requests").delete().eq("id", id);
  if (error) return { error: error.message };
  // The rows cascade; remove the stored files too.
  const paths = (docs ?? []).map((d) => d.storage_path);
  if (paths.length) await supabase.storage.from("evidence").remove(paths);
  revalidate();
  redirect("/requests");
}
