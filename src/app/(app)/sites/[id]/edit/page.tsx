import { notFound } from "next/navigation";
import { SiteForm } from "@/components/SiteForm";
import { createClient } from "@/lib/supabase/server";
import type { Parish, TestSite, WaterBody } from "@/lib/types";

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: site }, { data: parishes }, { data: waterBodies }] = await Promise.all([
    supabase.from("test_sites").select("*").eq("id", id).single(),
    supabase.from("parishes").select("*").order("county").order("name"),
    supabase.from("water_bodies").select("*").order("label"),
  ]);

  if (!site) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit site</h1>
      <div className="card">
        <SiteForm
          site={site as TestSite}
          parishes={(parishes as Parish[]) ?? []}
          waterBodies={(waterBodies as WaterBody[]) ?? []}
        />
      </div>
    </div>
  );
}
