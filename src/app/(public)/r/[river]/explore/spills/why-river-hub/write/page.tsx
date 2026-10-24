import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding } from "@/lib/river-context";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { WriteTool } from "@/components/public/WriteTool";
import { buildEvidence } from "@/lib/writeEvidence";
import type { EoRow, EoSummary } from "@/lib/emergencyOverflows";
import { publicRpc } from "@/lib/supabase/publicRpc";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Write to your MP — ${b.portalName}`,
    description:
      "Three steps: your local sewage evidence by postcode, the points worth making, and a deep link into WriteToThem. Written in your own words — never a form letter.",
  };
}

export default async function WritePage() {
  const supabase = createPublicClient();
  const b = await getBranding();
  const [rows, sumData] = await Promise.all([
    publicRpc<EoRow>(supabase, "public_emergency_overflows"),
    publicRpc<EoSummary>(supabase, "public_eo_summary"),
  ]);
  const summary = sumData[0] ?? null;
  const evidence = buildEvidence(rows, summary, b.riverName);

  return (
    <>
      <PageHeaderBand
        label="Why River Hub · Take action"
        title="Write to your MP"
        intro="Give your MP the evidence for your own doorstep and the specific asks — then write a short letter, in your own words. It takes a few minutes and reaches the one person who can put these questions to the regulator."
      />
      <PageBody>
        <WriteTool evidence={evidence} />
      </PageBody>
    </>
  );
}
