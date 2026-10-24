import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding } from "@/lib/river-context";
import { type ProblemRow } from "@/lib/spillProblems";
import { GapsView } from "@/components/public/GapsView";
import { publicRpc } from "@/lib/supabase/publicRpc";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Gaps — ${b.portalName}`,
    description: `Overflows in the ${b.riverName} catchment with a flagged problem and no measure recorded against them — ranked by severity. The headline gap in the public record.`,
  };
}

export default async function GapsPage() {
  const supabase = createPublicClient();
  const rows = await publicRpc<ProblemRow>(supabase, "public_spills_problems", {}, { required: true });
  const b = await getBranding();
  return <GapsView rows={rows} basePath="/explore/spills" companyName={b.companyName} />;
}
