import { SiteForm } from "@/components/SiteForm";
import { createClient } from "@/lib/supabase/server";
import type { Parish, WaterBody } from "@/lib/types";

export default async function NewSitePage() {
  const supabase = await createClient();
  const [{ data: parishes }, { data: waterBodies }] = await Promise.all([
    supabase.from("parishes").select("*").order("county").order("name"),
    supabase.from("water_bodies").select("*").order("label"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Add testing site</h1>
      <div className="card">
        <SiteForm
          parishes={(parishes as Parish[]) ?? []}
          waterBodies={(waterBodies as WaterBody[]) ?? []}
        />
      </div>
    </div>
  );
}
