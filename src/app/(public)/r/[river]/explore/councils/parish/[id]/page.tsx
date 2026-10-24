import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding } from "@/lib/river-context";
import { AreaSection } from "../../_area";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const b = await getBranding();
  const { id } = await params;
  const supabase = createPublicClient();
  const { data: parishes } = await supabase.rpc("public_parishes");
  const parish = (parishes ?? []).find((p) => p.id === id);
  return {
    title: parish ? `${parish.name} — ${b.portalName}` : `Parish — ${b.portalName}`,
    description: parish
      ? `Water-quality sites, sewage assets and treatment-works capacity for ${parish.name}, ${parish.district}.`
      : undefined,
  };
}

export default async function ParishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();
  const { data: parishes } = await supabase.rpc("public_parishes");
  const parish = (parishes ?? []).find((p) => p.id === id);
  if (!parish) notFound();

  return <AreaSection ids={[id]} title={parish.name} kicker={`Parish · ${parish.district}`} />;
}
