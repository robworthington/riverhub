import { AssetForm } from "@/components/AssetForm";
import { createClient } from "@/lib/supabase/server";
import type { Parish, WaterBody, SewageSystem } from "@/lib/types";

export default async function NewAssetPage() {
  const supabase = await createClient();
  const [{ data: systems }, { data: waterBodies }, { data: parishes }] = await Promise.all([
    supabase.from("sewage_systems").select("*").order("name"),
    supabase.from("water_bodies").select("*").order("label"),
    supabase.from("parishes").select("*").order("county").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Add sewage asset</h1>
      <div className="card">
        <AssetForm
          systems={(systems as SewageSystem[]) ?? []}
          waterBodies={(waterBodies as WaterBody[]) ?? []}
          parishes={(parishes as Parish[]) ?? []}
        />
      </div>
    </div>
  );
}
