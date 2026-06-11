import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { AreaSection } from "../../_area";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ district: string }> }): Promise<Metadata> {
  const { district } = await params;
  const name = decodeURIComponent(district);
  return {
    title: `${name} — ${INSTANCE.portalName}`,
    description: `Water-quality sites, sewage assets and treatment-works capacity across ${name}.`,
  };
}

export default async function DistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  const name = decodeURIComponent(district);

  const supabase = createPublicClient();
  const { data: parishes } = await supabase.rpc("public_parishes");
  const ids = (parishes ?? []).filter((p) => p.district === name).map((p) => p.id);
  if (!ids.length) notFound();

  return <AreaSection ids={ids} title={name} kicker={`District · ${ids.length} parishes`} />;
}
