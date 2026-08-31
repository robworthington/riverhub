import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { METHODOLOGY_URL, EA_THRESHOLD_MM } from "@/lib/dryspill";
import type { ProblemRow } from "@/lib/spillProblems";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Dry spilling — ${INSTANCE.portalName}`,
  description: `Dry-weather spills in the ${INSTANCE.riverName} catchment: a discharge with no rain to excuse it is a prima facie breach of regulation 4. Repeat offenders, and whether anything is on record against them.`,
};

type RepeatRow = { asset_id: string; asset_name: string; asset_code: string | null; years: number; total_dry: number };
type BoardRow = { asset_id: string; dry: number };

export default async function DrySpillingPage() {
  const supabase = createPublicClient();
  const year = new Date().getUTCFullYear();
  const [{ data: repeatData }, { data: pData }, { data: bData }] = await Promise.all([
    supabase.rpc("public_spills_repeat_offenders" as never, {} as never),
    supabase.rpc("public_spills_problems" as never, {} as never),
    supabase.rpc("public_spills_board" as never, { p_year: year } as never),
  ]);
  const repeat = (repeatData ?? []) as unknown as RepeatRow[];
  const problems = (pData ?? []) as unknown as ProblemRow[];
  const board = (bData ?? []) as unknown as BoardRow[];

  const hasAction = new Map(problems.map((p) => [p.asset_id, p.has_action]));
  const dryThisYear = board.reduce((s, r) => s + (r.dry ?? 0), 0);
  const drySince2020 = problems.reduce((s, r) => s + r.dry, 0);
  const repeatCount = repeat.length;
  const withScheme = repeat.filter((r) => hasAction.get(r.asset_id)).length;

  const cards = [
    { accent: "#6b4a8f", value: dryThisYear.toLocaleString(), label: `Dry spills in ${year}`, sub: "no rain to excuse them" },
    { accent: "#6b4a8f", value: drySince2020.toLocaleString(), label: "Dry spills since 2020", sub: "across the catchment" },
    { accent: "#9a4415", value: repeatCount, label: "Repeat offenders", sub: "dry in 2+ of the last 7 years" },
    { accent: "#b8342a", value: withScheme, label: "Have a scheme addressing it", sub: `of ${repeatCount} repeat offenders` },
  ];

  return (
    <div className="space-y-7 py-2">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Dry spilling</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">A spill in dry weather has no rainfall to excuse it. The same overflows do it year after year.</p>
      </div>

      {/* lawfulness hero */}
      <div className="rounded-[3px] border-l-[4px] px-[26px] py-6" style={{ background: "#f5f0fa", borderColor: "#d3c3e4", borderLeftColor: "#6b4a8f" }}>
        <div className="font-plexmono text-[12px] font-semibold uppercase tracking-[.09em] text-rh-dryDeep">The test that applies</div>
        <p className="mt-2 max-w-[820px] text-[19px] font-bold leading-[1.35] text-rh-ink">
          A storm overflow may discharge only in exceptional circumstances. Regular spilling in normal or moderate rainfall is a prima facie breach of regulation 4 of the Urban Waste Water Treatment Regulations 1994.
        </p>
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          This reading follows the Office for Environmental Protection&apos;s December 2024 findings against Defra, the Environment Agency and Ofwat, which set out a two-stage test — was the discharge caused by exceptional circumstances, and was it nonetheless kept to a minimum — and Defra&apos;s 24 March 2025 guidance, which supersedes the 1997 guidance the regulators had relied on.
        </p>
      </div>

      {/* stat cards */}
      <div className="flex flex-wrap gap-3">
        {cards.map((c) => (
          <div key={c.label} className="flex-[1_1_210px] rounded-[3px] border border-rh-line border-l-[4px] bg-rh-card px-5 py-4" style={{ borderLeftColor: c.accent }}>
            <div className="font-plexmono text-[32px] font-bold leading-none" style={{ color: c.accent }}>{c.value}</div>
            <div className="mt-1.5 text-[13.5px] font-semibold text-rh-ink">{c.label}</div>
            <div className="text-[12.5px] text-rh-ink3">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* repeat offenders table */}
      <div>
        <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Repeat dry-weather offenders</h2>
        <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
          <table className="min-w-[560px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                <th className="px-[18px] py-2 text-left font-semibold">Overflow</th>
                <th className="px-3 py-2 text-right font-semibold">Years</th>
                <th className="px-3 py-2 text-right font-semibold">Dry spills</th>
                <th className="px-[18px] py-2 text-left font-semibold">On record</th>
              </tr>
            </thead>
            <tbody>
              {repeat.map((r) => (
                <tr key={r.asset_id} className="border-b border-rh-rowDiv hover:bg-rh-rowHover">
                  <td className="px-[18px] py-2.5">
                    <Link href={`/explore/spills/${r.asset_id}`} className="font-semibold text-rh-ink hover:text-rh-teal hover:underline">{r.asset_name}</Link>
                    <div className="font-plexmono text-[11px] text-rh-quiet">{r.asset_code ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-plexmono font-semibold text-rh-ink">{r.years}</td>
                  <td className="px-3 py-2.5 text-right font-plexmono font-semibold text-rh-dry">{r.total_dry.toLocaleString()}</td>
                  <td className="px-[18px] py-2.5">
                    {hasAction.get(r.asset_id)
                      ? <span className="inline-flex rounded-[2px] border border-[#bcd4cf] bg-[#eaf1ef] px-2 py-0.5 text-[11px] font-semibold text-rh-teal">Measure linked</span>
                      : <span className="inline-flex rounded-[2px] border border-[#e8b6ae] bg-rh-alarmTint px-2 py-0.5 text-[11px] font-semibold text-rh-alarm">No measure</span>}
                  </td>
                </tr>
              ))}
              {repeat.length === 0 && <tr><td colSpan={4} className="px-[18px] py-6 text-center text-rh-ink3">No repeat offenders on record.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-rh-ink3">Each overflow&apos;s per-spill confidence (gauge proximity, antecedent-dry window, monitor uptime) is shown on every event&apos;s evidence dossier.</p>
      </div>

      {/* two panels */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">How we decide a spill was dry</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">
            A spill is counted as dry when rainfall at the nearest gauge was ≤ {EA_THRESHOLD_MM} mm on the spill day and the day before, and the spill lasted at least 15 minutes. Confidence rises with a closer gauge, a longer antecedent-dry window, and a monitor that was reporting reliably. <Link href="/explore/spills/method" className="text-rh-teal hover:underline">Read the full method →</Link>
          </p>
        </div>
        <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">Why this now carries more weight</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">
            A dry-day spill is a pollution incident regardless of its volume. Dry-spill frequency is a scored metric in the Environment Agency&apos;s 2026–30 regime, and updated incident guidance removes companies&apos; former latitude to downgrade these events. A pattern of them is exactly what a regulator is now expected to act on.
          </p>
        </div>
      </div>

      <p className="text-[12px] text-rh-ink3"><a href={METHODOLOGY_URL} className="text-rh-teal hover:underline" target="_blank" rel="noopener">Dry-spill method ↗</a> · figures reproducible against the pinned method version.</p>
    </div>
  );
}
