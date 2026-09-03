import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { StatCard } from "@/components/public/StatCard";
import { EmergencyOverflowsTable } from "@/components/public/EmergencyOverflowsTable";
import { EoMap } from "@/components/public/EoMap";
import { type EoRow, type EoSummary, fmtHours, eoDisplayName } from "@/lib/emergencyOverflows";
import { prettyWorksName } from "@/lib/overflowNames";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { DonateAsk } from "@/components/public/DonateAsk";

// Rendered per-request against the live DB — see gaps/page.tsx (ISR stale-empty pattern). Also means
// an instance with no EO data yet (e.g. Teign before its own EIR) shows the empty state, not a stale build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Emergency overflows — ${INSTANCE.portalName}`,
  description: `Pumping-station emergency overflows on the ${INSTANCE.riverName} — meant to fire only when a pump fails, but some discharge for hundreds of hours a year. Not in any live feed; obtained by an EIR request.`,
};

export default async function EmergencyOverflowsPage() {
  const supabase = createPublicClient();
  const [{ data: eoData }, { data: sumData }] = await Promise.all([
    supabase.rpc("public_emergency_overflows" as never, {} as never),
    supabase.rpc("public_eo_summary" as never, {} as never),
  ]);
  const rows = (eoData ?? []) as unknown as EoRow[];
  const summary = ((sumData ?? []) as unknown as EoSummary[])[0] ?? null;

  // "Not an emergency": the worst offenders, worst-first, above a meaningful threshold.
  const worst = rows.filter((r) => (r.worst_hours ?? 0) >= 100).sort((a, b) => (b.worst_hours ?? 0) - (a.worst_hours ?? 0)).slice(0, 5);
  const totalHoursAll = rows.reduce((s, r) => s + r.total_hours, 0);

  const intro = `A separate class of overflow, hidden from the usual data. Meant to discharge only when a pumping station fails — yet some spill into the ${INSTANCE.riverName} for hundreds of hours a year.`;

  if (rows.length === 0) {
    return (
      <>
        <PageHeaderBand title="Emergency overflows" intro={intro} />
        <PageBody>
          <div className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-6 text-[14px] text-rh-ink2">
            No emergency-overflow records have been loaded for the {INSTANCE.riverName} yet. These are obtained by an
            Environmental Information Regulations (EIR) request to the water company, not from a live feed.
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeaderBand title="Emergency overflows" intro={intro} />
      <PageBody className="space-y-7">

      {/* what an EO is + why there's no feed */}
      <div className="grid gap-[18px] md:grid-cols-2">
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#6b4a8f] bg-rh-card px-[22px] py-5">
          <h2 className="text-[15px] font-bold text-rh-ink">What is an emergency overflow?</h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-rh-ink2">
            A pumping station lifts sewage over hills toward a treatment works. An <strong>emergency overflow</strong> (EO,
            or PSEO) is a relief outlet that discharges raw sewage straight to the river if that pump fails — a power cut,
            a mechanical failure, a blockage — to stop it backing up into homes and streets. It is permitted, but only for
            genuine emergencies. An EO firing for hundreds of hours is not an emergency; it is a chronic fault.
          </p>
        </div>
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-card px-[22px] py-5">
          <h2 className="text-[15px] font-bold text-rh-ink">Why there is no live feed</h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-rh-ink2">
            EOs carry the same EDM monitoring hardware as storm overflows, but their data sits in a{" "}
            <strong>different regulatory category</strong>: it is not published in the near-real-time storm-overflow feed
            this site tracks, nor in the Environment Agency&apos;s annual storm-overflow return. The only way to see it is
            to ask. The figures below were obtained by an <strong>EIR request (EIR26209)</strong> — a snapshot, not a feed,
            refreshed when a new disclosure is made.
          </p>
        </div>
      </div>

      {/* headline stats */}
      <div className="flex flex-wrap gap-3">
        <StatCard accent="prestw" value={summary?.eo_count ?? rows.length} caption="Emergency overflows on record" subline={`across the ${INSTANCE.riverName} catchment`} />
        <StatCard accent="alarm" value={summary?.active_count ?? 0} caption={`Discharged in ${summary?.lfy ?? "the last full year"}`} subline="the last complete year of data" />
        <StatCard accent="amber" value={fmtHours(summary?.hours_lfy)} caption={`Hours discharged, ${summary?.lfy ?? ""}`} subline="raw sewage, in one year" />
        <StatCard accent="alarm" value={fmtHours(summary?.worst_hours)} caption="Worst single overflow that year" subline={summary?.worst_name ? eoDisplayName(summary.worst_name) : undefined} />
      </div>

      {/* not an emergency — worst offenders */}
      {worst.length > 0 && (
        <div className="rounded-[3px] border border-[#e8b6ae] border-l-[4px] border-l-rh-alarm bg-rh-alarmTint px-[26px] py-6">
          <h2 className="text-[20px] font-bold leading-[1.3] text-rh-ink">These are not emergencies.</h2>
          <p className="mt-2 max-w-[760px] text-[13.5px] leading-[1.55] text-rh-ink2">
            An emergency overflow should fire for minutes, a handful of times, when something breaks. In their worst single
            year, these fired for the durations below — the equivalent of days or weeks of continuous discharge.
          </p>
          <div className="mt-4 space-y-2">
            {worst.map((r, i) => {
              const days = (r.worst_hours ?? 0) / 24;
              return (
                <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-[#ecd3ce] pt-2 first:border-0 first:pt-0">
                  <span className="font-plexmono text-[13px] font-bold text-rh-alarm">{i + 1}</span>
                  <span className="text-[14.5px] font-semibold text-rh-ink">{eoDisplayName(r.overflow_name)}</span>
                  <span className="font-plexmono text-[13px] font-bold text-rh-alarm">{fmtHours(r.worst_hours)} hours</span>
                  <span className="text-[12.5px] text-rh-ink2">
                    in {r.worst_year} — about {days >= 1 ? `${days.toFixed(days >= 10 ? 0 : 1)} days` : "under a day"} of discharge{r.system_name ? `, at ${prettyWorksName(r.system_name)} works` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* full record */}
      <div>
        <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Every emergency overflow, {rows.length} in all</h2>
        <p className="mb-3 max-w-[760px] text-[12.5px] text-rh-ink3">
          Hours of discharge per year, 2020–2025. Sort by any column. Together they account for about{" "}
          <strong>{Math.round(totalHoursAll).toLocaleString()} hours</strong> of recorded discharge. Duration is the honest
          measure here — the spill <em>count</em> uses the EA&apos;s 12/24-hour block method, which folds one long discharge
          into just a few &ldquo;spills&rdquo;.
        </p>
        <EmergencyOverflowsTable rows={rows} />
      </div>

      {/* map */}
      <div>
        <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Where they are</h2>
        <p className="mb-3 max-w-[720px] text-[12.5px] text-rh-ink3">Sized and coloured by total recorded hours. Clustered around Dartmouth, Totnes and Buckfastleigh — at the pumping stations that lift sewage to each town&apos;s works.</p>
        <EoMap rows={rows} />
      </div>

      {/* caveats */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">How to read this, and what it cannot show</h2>
        <ul className="mt-2 max-w-[820px] list-disc space-y-1.5 pl-5 text-[13px] leading-[1.5] text-rh-ink2">
          <li>A <strong>dash</strong> means there was no monitor that year — most EOs were only fitted with EDM around 2022, so a zero before then is absence of data, not absence of spills.</li>
          <li><strong>2025 is year-to-date</strong> and incomplete; it is excluded from the &ldquo;last full year&rdquo; figures.</li>
          <li>The spill <strong>count</strong> follows the EA 12/24-hour block method: a discharge&apos;s first 12 hours count as one spill, each further 24 hours as one more — so a very long spill shows a low count.</li>
          <li>This is an <strong>EIR snapshot (EIR26209)</strong>, not a live feed. It will not change until the next disclosure. Figures are as supplied by the water company.</li>
        </ul>
      </div>

      <DonateAsk
        title={`${summary?.eo_count ?? rows.length} emergency overflows. One EIR request to find them.`}
        body="Every figure on this page came from an information request, not a public feed. Help us do the same for every river before the next round of national spending is decided."
      />
      </PageBody>
    </>
  );
}
