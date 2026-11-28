import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { regulatorFor } from "@/lib/nation";
import { AreaSection } from "../../_area";

export const revalidate = 3600;

// Parishes come from the current river only (p_org). Unscoped, the national site returned every river's
// parishes (4,000+), which the data API cuts at 1,000 rows: most parish pages 404'd and district pages
// missed parishes (Nov 2026).

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  const { id } = await params;
  const supabase = createPublicClient();
  const { data: parishes } = await supabase.rpc("public_parishes", { p_org: (await getCurrentRiver())?.orgId });
  const parish = (parishes ?? []).find((p) => p.id === id);
  return {
    title: parish ? `${parish.name} — ${b.portalName}` : `${reg.councilArea.charAt(0).toUpperCase() + reg.councilArea.slice(1)} — ${b.portalName}`,
    description: parish
      ? `Water-quality sites, sewage assets and treatment-works capacity for ${parish.name}, ${parish.district}.`
      : undefined,
  };
}

export default async function ParishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();
  const river = await getCurrentRiver();
  const reg = regulatorFor(river?.nation);
  const { data: parishes } = await supabase.rpc("public_parishes", { p_org: river?.orgId });
  const parish = (parishes ?? []).find((p) => p.id === id);
  if (!parish) notFound();

  return <AreaSection ids={[id]} title={parish.name} kicker={`${reg.councilArea.charAt(0).toUpperCase() + reg.councilArea.slice(1)} · ${parish.district}`} />;
}
