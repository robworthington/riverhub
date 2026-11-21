import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { type ProblemRow } from "@/lib/spillProblems";
import { GapsView } from "@/components/public/GapsView";
import { resolveRiver } from "@/lib/river";
import { publicRpc } from "@/lib/supabase/publicRpc";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

type Params = { params: Promise<{ river: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { river: slug } = await params;
  const river = await resolveRiver(slug);
  if (!river) return { title: "River not found" };
  const name = river.portalName ?? river.riverName ?? "River Hub";
  return {
    title: `Gaps — ${name}`,
    description: `Overflows in the ${river.riverName ?? "catchment"} with a flagged problem and no measure recorded against them — ranked by severity. The headline gap in the public record.`,
  };
}

export default async function RiverGapsPage({ params }: Params) {
  const { river: slug } = await params;
  const river = await resolveRiver(slug);
  if (!river) notFound();

  const supabase = createPublicClient();
  const rows = await publicRpc<ProblemRow>(
    supabase,
    "public_spills_problems",
    { p_org: river.orgId },
    { required: true },
  );

  return (
    <GapsView
      rows={rows}
      basePath={`/r/${river.slug}/explore/spills`}
      companyName={river.companyName ?? "The water company"}
    />
  );
}
