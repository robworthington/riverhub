import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";
import { OverflowName } from "@/components/public/OverflowName";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { publicRpc } from "@/lib/supabase/publicRpc";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export const metadata: Metadata = {
  title: `Why it keeps happening — ${INSTANCE.portalName}`,
  description: `Three things we can measure in the ${INSTANCE.riverName} spill record — dry-weather spills, works over their permitted flow, and spills ahead of the works — each pointing at a different infrastructure problem, remedy and accountable body.`,
};

type WorksRow = { verdict: "over" | "limit" | "within" | "not_assessed" };

export default async function WhyOverviewPage() {
  const supabase = createPublicClient();
  const [rows, works, repeat] = await Promise.all([
    publicRpc<ProblemRow>(supabase, "public_spills_problems", {}, { required: true }),
    publicRpc<WorksRow>(supabase, "public_spills_works", {}, { required: true }),
    publicRpc<unknown>(supabase, "public_spills_repeat_offenders", {}, { required: true }),
  ]);

  // "dry" indicator = the repeat dry-weather offenders — the same overflows the dry page lists, so
  // the "See the N" figure matches its drill-down exactly.
  const dryCount = repeat.length;
  // match the before-works page, which lists every overflow with pre_stw > 0 (not the >=4 weight
  // threshold), so "See the N" always equals the rows on that page.
  const preCount = rows.filter((r) => r.pre_stw > 0).length;
  const overCount = works.filter((w) => w.verdict === "over").length;

  const indicators = [
    {
      accent: "#6b4a8f", eyebrow: "Indicator 1", tag: "Dry", figure: dryCount,
      heading: "overflows spilling with no rain to excuse it",
      body: "A discharge in dry weather is not an exceptional circumstance, so it is not permitted on any reading of regulation 4.",
      href: "/explore/spills/why/dry", link: `See the ${dryCount}`,
    },
    {
      accent: "#b8342a", eyebrow: "Indicator 2", tag: "Overloaded", figure: overCount,
      heading: "works whose estimated load sits above their permitted flow",
      body: "A strong signal, not a finding. We cannot see whether flow is transferred to another works for treatment, and the permitted figure is not always published.",
      href: "/explore/spills/why/capacity", link: `See the ${overCount}`,
    },
    {
      accent: "#9a4415", eyebrow: "Indicator 3", tag: "Early", figure: preCount,
      heading: "overflows that spilled while their works stayed shut",
      body: "Rainfall across the catchment does not explain a discharge that an overflow's own treatment works did not share.",
      href: "/explore/spills/why/before-works", link: `See the ${preCount}`,
    },
  ];

  // where the indicators concentrate: the flagged overflows, worst first
  const concentration = rows
    .filter((r) => r.weight > 0)
    .slice()
    .sort((a, b) => b.weight - a.weight || b.hours_lfy - a.hours_lfy)
    .slice(0, 10)
    .map((r) => {
      const top = PROBLEMS.filter((p) => p.w(r) > 0).sort((a, b) => b.w(r) - a.w(r))[0];
      return { r, points: top?.label ?? "—" };
    });

  return (
    <>
      <PageHeaderBand
        title="Why it keeps happening"
        intro="Three things we can measure in the data. None of them proves a cause on its own, but each points at a different kind of infrastructure problem."
      />
      <PageBody className="space-y-7">
      {/* three indicator cards */}
      <div className="grid gap-[18px] md:grid-cols-3">
        {indicators.map((ind) => (
          <div key={ind.eyebrow} className="flex flex-col rounded-[3px] border border-rh-line border-t-[4px] bg-rh-card px-[26px] pb-[28px] pt-[26px]" style={{ borderTopColor: ind.accent }}>
            <div className="font-plexmono text-[12px] font-semibold uppercase tracking-[.09em]" style={{ color: ind.accent }}>{ind.eyebrow}</div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="font-plexmono text-[58px] font-semibold leading-[.92]" style={{ color: ind.accent }}>{ind.figure}</span>
              <span className="text-[15px] font-bold uppercase tracking-[.04em]" style={{ color: ind.accent }}>{ind.tag}</span>
            </div>
            <div className="mt-2 text-[16px] font-semibold text-rh-ink">{ind.heading}</div>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-rh-ink2">{ind.body}</p>
            <Link href={ind.href} className="mt-auto pt-4 inline-block text-[13px] font-semibold text-rh-teal hover:underline">{ind.link} →</Link>
          </div>
        ))}
      </div>

      {/* concentration table */}
      <div>
        <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Where the indicators concentrate</h2>
        <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
          <table className="min-w-[640px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                <th className="px-[18px] py-2 text-left font-semibold">Overflow</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
                <th className="px-3 py-2 text-right font-semibold">Dry</th>
                <th className="px-3 py-2 text-left font-semibold">What it points to</th>
                <th className="px-[18px] py-2 text-left font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {concentration.map(({ r, points }) => (
                <tr key={r.asset_id} className="border-b border-rh-rowDiv hover:bg-rh-rowHover">
                  <td className="px-[18px] py-2.5">
                    <Link href={`/explore/spills/${r.asset_id}`} className="font-semibold text-rh-ink hover:text-rh-teal hover:underline"><OverflowName raw={r.asset_name} /></Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-plexmono text-rh-ink2">{r.hours_lfy.toLocaleString()}</td>
                  <td className={`px-3 py-2.5 text-right font-plexmono ${r.dry > 0 ? "font-semibold text-rh-dry" : "text-rh-quiet"}`}>{r.dry}</td>
                  <td className="px-3 py-2.5 text-rh-ink2">{points}</td>
                  <td className="px-[18px] py-2.5">
                    {r.has_action
                      ? <span className="inline-flex rounded-[2px] border border-[#bcd4cf] bg-[#eaf1ef] px-2 py-0.5 text-[11px] font-semibold text-rh-teal">On record</span>
                      : <span className="inline-flex rounded-[2px] border border-[#e8b6ae] bg-rh-alarmTint px-2 py-0.5 text-[11px] font-semibold text-rh-alarm">No action</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-rh-ink3">Hours are the last full year; dry spills are since 2020. Verdict is whether a measure is linked to the overflow — see <Link href="/explore/spills/gaps" className="text-rh-teal hover:underline">the gaps</Link>.</p>
      </div>

      {/* what this cannot see */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">What this analysis cannot see</h2>
        <p className="mt-2 max-w-[760px] text-[13px] leading-[1.55] text-rh-ink2">
          These indicators are measured from spill timing and rainfall alone. They cannot see misconnections, the quality of effluent from a works that is running normally, flow transferred between works for treatment, a company&apos;s maintenance history, or the periods when a monitor was offline. Because a quiet monitor records nothing, every count here is a <strong>floor, not a total</strong>.
        </p>
      </div>
      </PageBody>
    </>
  );
}
