"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";

export interface SitePhotoInput {
  storage_path: string;
  caption?: string | null;
}

export interface SiteInput {
  name: string;
  site_code?: string | null;
  type?: "bathing_water" | "community_designated" | null;
  rationale?: string | null;
  description?: string | null;
  parish_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  what_three_words?: string | null;
  tidal?: boolean;
  water_body_id?: string | null;
  public_or_private?: boolean | null;
  land_ownership?: string | null;
  sampling_strategy?: string | null;
  land_access_permission?: boolean | null;
  access_point?: string | null;
  notes?: string | null;
  photos?: SitePhotoInput[];
}

export async function createSite(input: SiteInput): Promise<{ error?: string }> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const { photos, ...site } = input;

  const { data, error } = await supabase
    .from("test_sites")
    .insert({
      ...site,
      organisation_id: profile.organisation_id,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create site." };

  if (photos?.length) {
    await supabase.from("site_photos").insert(
      photos.map((p) => ({
        site_id: data.id,
        storage_path: p.storage_path,
        caption: p.caption ?? null,
        uploaded_by: profile.id,
      })),
    );
  }

  revalidatePath("/sites");
  redirect(`/sites/${data.id}`);
}

export async function updateSite(
  id: string,
  input: SiteInput,
): Promise<{ error?: string }> {
  await requireEditor();
  const supabase = await createClient();
  const { photos, ...site } = input;

  const { error } = await supabase.from("test_sites").update(site).eq("id", id);
  if (error) return { error: error.message };

  if (photos?.length) {
    await supabase.from("site_photos").insert(
      photos.map((p) => ({
        site_id: id,
        storage_path: p.storage_path,
        caption: p.caption ?? null,
      })),
    );
  }

  revalidatePath(`/sites/${id}`);
  redirect(`/sites/${id}`);
}
