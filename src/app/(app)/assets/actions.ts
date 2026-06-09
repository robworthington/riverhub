"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireEditor, requireAdmin } from "@/lib/auth";
import { syncOrgEdm, type SyncSummary } from "@/lib/edm/sync";
import type { AssetType } from "@/lib/types";

export interface AssetInput {
  asset_name: string;
  asset_unique_id?: string | null;
  asset_type?: AssetType | null;
  sewage_system_id?: string | null;
  water_body_id?: string | null;
  parish_id?: string | null;
  storage_capacity?: number | null;
  processing_capacity?: number | null;
  asset_owner?: string | null;
  asset_address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  edm_enabled?: boolean;
  actual_capacity_m3d?: number | null;
  actual_capacity_source?: string | null;
  eir_ref?: string | null;
  eir_requested_on?: string | null;
  eir_received_on?: string | null;
  notes?: string | null;
}

export async function createAsset(input: AssetInput): Promise<{ error?: string }> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sewage_assets")
    .insert({ ...input, organisation_id: profile.organisation_id, created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create asset." };
  revalidatePath("/assets");
  redirect(`/assets/${data.id}`);
}

export async function updateAsset(id: string, input: AssetInput): Promise<{ error?: string }> {
  await requireEditor();
  const supabase = await createClient();
  const { error } = await supabase.from("sewage_assets").update(input).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/assets/${id}`);
  redirect(`/assets/${id}`);
}

export interface PermitInput {
  permit_number?: string | null;
  permit_start_date?: string | null;
  permit_revocation_date?: string | null;
  required_processing_volume?: number | null;
  required_storage_capacity?: number | null;
  permit_doc_path?: string | null;
  permit_url?: string | null;
  permit_dwf_m3d?: number | null;
  permit_fft_m3d?: number | null;
  permit_pe?: number | null;
}

export async function addPermit(assetId: string, input: PermitInput): Promise<{ error?: string }> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_permits")
    .insert({ ...input, asset_id: assetId, organisation_id: profile.organisation_id });
  if (error) return { error: error.message };
  revalidatePath(`/assets/${assetId}`);
  return {};
}

export async function addAssetPhoto(
  assetId: string,
  storagePath: string,
  caption: string | null,
): Promise<{ error?: string }> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_photos")
    .insert({ asset_id: assetId, storage_path: storagePath, caption, uploaded_by: profile.id });
  if (error) return { error: error.message };
  revalidatePath(`/assets/${assetId}`);
  return {};
}

export async function createSystem(name: string, description: string | null): Promise<{ error?: string }> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const { error } = await supabase
    .from("sewage_systems")
    .insert({ name, description, organisation_id: profile.organisation_id });
  if (error) return { error: error.message };
  revalidatePath("/sewage-systems");
  redirect("/sewage-systems");
}

/** Admin-triggered immediate EDM sync for this organisation. */
export async function syncNow(): Promise<{ summary?: SyncSummary; error?: string }> {
  const profile = await requireAdmin();
  const db = createAdminClient();
  const summary = await syncOrgEdm(db, profile.organisation_id, new Date().toISOString());
  revalidatePath("/assets");
  return { summary };
}
