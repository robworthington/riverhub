import { notFound } from "next/navigation";
import { AssetForm } from "@/components/AssetForm";
import { createClient } from "@/lib/supabase/server";
import type { Parish, WaterBody, SewageSystem, SewageAsset } from "@/lib/types";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: asset }, { data: systems }, { data: waterBodies }, { data: parishes }] =
    await Promise.all([
      supabase.from("sewage_assets").select("*").eq("id", id).single(),
      supabase.from("sewage_systems").select("*").order("name"),
      supabase.from("water_bodies").select("*").order("label"),
      supabase.from("parishes").select("*").order("county").order("name"),
    ]);

  if (!asset) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit asset</h1>
      <div className="card">
        <AssetForm
          asset={asset as SewageAsset}
          systems={(systems as SewageSystem[]) ?? []}
          waterBodies={(waterBodies as WaterBody[]) ?? []}
          parishes={(parishes as Parish[]) ?? []}
        />
      </div>
    </div>
  );
}
