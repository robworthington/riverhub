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

export async function generateMetadata({ params }: { params: Promise<{ district: string }> }): Promise<Metadata> {
  const b = await getBranding();
  const { district } = await params;
  const name = decodeURIComponent(district);
  return {
    title: `${name} — ${b.portalName}`,
    description: `Water-quality sites, sewage assets and treatment-works capacity across ${name}.`,
  };
}

export default async function DistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  const name = decodeURIComponent(district);

  const supabase = createPublicClient();
  const river = await getCurrentRiver();
  const reg = regulatorFor(river?.nation);
  const { data: parishes } = await supabase.rpc("public_parishes", { p_org: river?.orgId });
  const ids = (parishes ?? []).filter((p) => p.district === name).map((p) => p.id);
  if (!ids.length) notFound();

  return <AreaSection ids={ids} title={name} kicker={`${reg.districtLabel} · ${ids.length} ${reg.councilAreas}`} />;
}
