import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import type { ProblemRow } from "@/lib/spillProblems";
import { OverflowName } from "@/components/public/OverflowName";
import { prettyWorksName } from "@/lib/overflowNames";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export const metadata: Metadata = {
  title: `Before the works — ${INSTANCE.portalName}`,
  description: `Overflows in the ${INSTANCE.riverName} catchment that discharged while their own treatment works stayed shut — a local fault, not catchment-wide capacity, and chargeable now.`,
};

export default async function BeforeWorksPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_problems" as never, {} as never);
  const rows = ((data ?? []) as unknown as ProblemRow[])
    .filter((r) => r.pre_stw > 0)
    .sort((a, b) => b.pre_stw - a.pre_stw);

  return (
    <>
      <PageHeaderBand
        title="Before the works"
        intro="An overflow that spills while its own treatment works stays shut is not being overwhelmed by rain — the problem is upstream of the works, and local."
      />
      <PageBody className="space-y-7">
      {/* hero */}
      <div className="rounded-[3px] border-l-[4px] px-[26px] py-6" style={{ background: "#fdf1ea", borderColor: "#e6c4ad", borderLeftColor: "#9a4415" }}>
        <p className="max-w-[820px] text-[19px] font-bold leading-[1.35] text-rh-ink">
          If the sewer network were genuinely overwhelmed by rainfall, the treatment works&apos; own storm overflow would be discharging too.
        </p>
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          When an upstream overflow spills on a day its works did not, the works still had capacity — so the discharge points to a blockage, a failed pump, or infiltration on that branch, not to a works too small for its catchment. That changes who pays and how fast: a branch fault is maintenance, chargeable now, not a capital scheme waiting for the next five-year price review.
        </p>
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <table className="min-w-[560px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
              <th className="px-[18px] py-2 text-left font-semibold">Overflow</th>
              <th className="px-3 py-2 text-right font-semibold">Events</th>
              <th className="px-3 py-2 text-left font-semibold">Its works</th>
              <th className="px-[18px] py-2 text-left font-semibold">On record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset_id} className="border-b border-rh-rowDiv hover:bg-rh-rowHover">
                <td className="px-[18px] py-2.5">
                  <Link href={`/explore/spills/${r.asset_id}`} className="font-semibold text-rh-ink hover:text-rh-teal hover:underline"><OverflowName raw={r.asset_name} /></Link>
                </td>
                <td className="px-3 py-2.5 text-right font-plexmono font-semibold text-rh-prestw">{r.pre_stw.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-rh-ink2">{r.system_name ? prettyWorksName(r.system_name) : "—"}</td>
                <td className="px-[18px] py-2.5">
                  {r.has_action
                    ? <span className="inline-flex rounded-[2px] border border-[#bcd4cf] bg-[#eaf1ef] px-2 py-0.5 text-[11px] font-semibold text-rh-teal">Measure linked</span>
                    : <span className="inline-flex rounded-[2px] border border-[#e8b6ae] bg-rh-alarmTint px-2 py-0.5 text-[11px] font-semibold text-rh-alarm">No measure</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-[18px] py-6 text-center text-rh-ink3">No pre-works spills on record.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* caveat */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">What this needs to be reliable</h2>
        <p className="mt-2 max-w-[760px] text-[13px] leading-[1.55] text-rh-ink2">
          The comparison needs <strong>both</strong> monitors working. Where a works&apos; own overflow monitor was offline we record no result rather than a pre-works spill, so this is a floor. A treatment works itself is excluded — it is the end of the line and cannot spill <em>before</em> the works. Two works in the catchment have no monitored overflow at all, so their upstream overflows are listed as <em>not assessed</em>, not as clean.
        </p>
      </div>
      </PageBody>
    </>
  );
}
