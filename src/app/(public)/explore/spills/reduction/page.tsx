import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { OverflowName } from "@/components/public/OverflowName";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";

// Rendered per-request against the live DB — see the note in gaps/page.tsx (ISR stale-empty pattern).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Reduction tracker — ${INSTANCE.portalName}`,
  description: `The Storm Overflows Discharge Reduction Plan sets no target for any individual overflow — so we build one from the EDM record: each outlet's spills per year against its 2020 baseline and the plan's 10/year cap.`,
};

type ReductionRow = {
  asset_id: string; asset_name: string; asset_code: string | null; system_name: string | null;
  baseline_year: number; baseline: number; latest_year: number; latest: number;
  pct_change: number | null; x_cap: number | string; deadline: string;
  verdict: "within" | "rising" | "falling"; series: { year: number; count: number }[];
};

function Sparkline({ counts, verdict }: { counts: number[]; verdict: string }) {
  const W = 120, H = 30, pad = 3, cap = 10;
  if (counts.length < 2) return <span className="text-rh-quiet">—</span>;
  const max = Math.max(...counts, cap) * 1.08;
  const x = (i: number) => pad + (W - 2 * pad) * (i / (counts.length - 1));
  const y = (v: number) => H - pad - (H - 2 * pad) * (v / max);
  const col = verdict === "within" ? "#0d6b62" : verdict === "rising" ? "#b8342a" : "#c07a12";
  const d = counts.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L ${x(counts.length - 1).toFixed(1)} ${(H - pad).toFixed(1)} L ${x(0).toFixed(1)} ${(H - pad).toFixed(1)} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`trajectory, latest ${counts[counts.length - 1]}`}>
      <line x1={0} x2={W} y1={y(cap)} y2={y(cap)} stroke="#101b1d" strokeWidth={1} strokeDasharray="2 2.5" opacity={0.4} />
      <path d={area} fill={col} opacity={0.12} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(counts.length - 1)} cy={y(counts[counts.length - 1])} r={2.4} fill={col} />
    </svg>
  );
}

function verdictChip(r: ReductionRow) {
  const xcap = Number(r.x_cap);
  if (r.verdict === "within") return { label: "Within the cap", cls: "text-rh-teal bg-rh-chipTealBg border-rh-chipTealBorder" };
  if (r.verdict === "rising") return { label: "Rising", cls: "text-rh-alarm bg-rh-alarmTint border-rh-alarmBorder" };
  if (r.deadline === "2035") return { label: "Off track for 2035", cls: "text-rh-alarm bg-rh-alarmTint border-rh-alarmBorder" };
  if (xcap <= 1.5) return { label: "Nearly there", cls: "text-rh-amber bg-rh-chipAmberBg border-rh-chipAmberBorder" };
  return { label: "Falling — behind", cls: "text-rh-amber bg-rh-chipAmberBg border-rh-chipAmberBorder" };
}

export default async function ReductionPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_reduction" as never, {} as never);
  const rows = (data ?? []) as unknown as ReductionRow[];

  const overCap = rows.filter((r) => r.latest > 10).length;
  const rising = rows.filter((r) => r.verdict === "rising").length;
  const within = rows.filter((r) => r.latest <= 10).length;
  const on2035 = rows.filter((r) => r.deadline === "2035").length;
  const latestYear = rows[0]?.latest_year ?? new Date().getUTCFullYear() - 1;

  const stats = [
    { v: overCap, k: "Above the 2050 cap", n: `of ${rows.length} tracked`, tone: "crit" },
    { v: rising, k: "Rising since baseline", n: "trend is the wrong way", tone: "crit" },
    { v: on2035, k: "On a 2035 deadline", n: "near a bathing water", tone: "warn" },
    { v: within, k: "Within the cap", n: `≤10 spills in ${latestYear}`, tone: "ok" },
  ];
  const toneColor = (t: string) => (t === "crit" ? "#b8342a" : t === "warn" ? "#c07a12" : "#0d6b62");

  return (
    <>
      <PageHeaderBand
        title="Reduction tracker"
        intro={<>Is each overflow actually spilling less? The reduction plan won&apos;t tell you per overflow — so we measure it from the spill record.</>}
      />
      <PageBody className="space-y-7">
      {/* intro — what the plan is */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[26px] py-6">
        <h2 className="text-[16px] font-bold text-rh-ink">What the plan is, and what it leaves out</h2>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.6] text-rh-ink2">
          The <strong>Storm Overflows Discharge Reduction Plan</strong> is the government&apos;s plan — published in 2022 and expanded in September 2023 — to cut how often England&apos;s storm overflows discharge. It sets deadlines by <strong>category</strong>, not by overflow:
        </p>
        <ul className="mt-3 max-w-[820px] space-y-1.5 text-[13.5px] leading-[1.5] text-rh-ink2">
          <li><span className="font-plexmono font-semibold text-rh-ink">By 2035</span> — overflows near <em>every</em> designated bathing water, and 75% of those near high-priority nature sites, must be improved.</li>
          <li><span className="font-plexmono font-semibold text-rh-ink">By 2045</span> — the remaining high-priority overflows.</li>
          <li><span className="font-plexmono font-semibold text-rh-ink">By 2050</span> — <em>every</em> storm overflow, with discharges capped at around <strong>10 spills a year</strong> regardless of location.</li>
        </ul>
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.6] text-rh-ink2">
          The targets are due to be <strong>reviewed in 2027</strong> — a commitment in the plan, not a statutory duty. But the plan sets <strong>no target for any individual overflow and publishes no per-overflow progress</strong> — only these whole-category deadlines, and it doesn&apos;t even publish which specific overflows are high-priority. So there is no official way to ask &ldquo;is <em>this</em> overflow on track?&rdquo; This page builds that view from the Environment Agency&apos;s EDM record: each overflow&apos;s spills per year against its <strong>2020 baseline</strong> and the <strong>2050 cap of ~10</strong>, with the deadline its location implies.
        </p>
      </div>

      {/* summary */}
      <div className="flex flex-wrap gap-3">
        {stats.map((s) => (
          <div key={s.k} className="flex-[1_1_200px] rounded-[3px] border border-rh-line bg-rh-card px-[18px] py-4" style={{ borderLeft: `4px solid ${toneColor(s.tone)}` }}>
            <div className="font-plexmono text-[30px] font-bold leading-none" style={{ color: toneColor(s.tone) }}>{s.v}</div>
            <div className="mt-1.5 text-[13px] font-semibold text-rh-ink">{s.k}</div>
            <div className="text-[12px] text-rh-ink3">{s.n}</div>
          </div>
        ))}
      </div>

      {/* board */}
      <div>
        <h2 className="mb-1 text-[16px] font-bold text-rh-ink">Every overflow against its cap</h2>
        <p className="mb-3 max-w-[760px] text-[12.5px] text-rh-ink3">Ranked by the latest full year&apos;s spills. The deadline is derived from proximity to a designated site — indicative, not an official per-overflow target. The dotted line on each trajectory is the 10-spills cap.</p>
        <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
          <table className="min-w-[800px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                <th className="px-[18px] py-2 text-left">Overflow</th>
                <th className="px-3 py-2 text-left">Deadline</th>
                <th className="px-3 py-2 text-right">Baseline</th>
                <th className="px-3 py-2 text-right">Latest</th>
                <th className="px-3 py-2 text-right">Since baseline</th>
                <th className="px-3 py-2 text-right">vs cap</th>
                <th className="px-3 py-2 text-left">Trajectory</th>
                <th className="px-[18px] py-2 text-left">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vc = verdictChip(r);
                const xcap = Number(r.x_cap);
                return (
                  <tr key={r.asset_id} className="border-b border-rh-rowDiv align-middle hover:bg-rh-rowHover">
                    <td className="px-[18px] py-2.5">
                      <Link href={`/explore/spills/${r.asset_id}`} className="font-semibold text-rh-ink hover:text-rh-teal hover:underline"><OverflowName raw={r.asset_name} /></Link>
                      <div className="font-plexmono text-[10.5px] text-rh-quiet">{r.asset_code ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5"><span className={`font-plexmono text-[12px] ${r.deadline === "2035" ? "font-semibold text-rh-alarm" : "text-rh-ink2"}`}>{r.deadline}</span></td>
                    <td className="px-3 py-2.5 text-right font-plexmono text-rh-ink2">{r.baseline}{r.baseline_year !== 2020 && <span className="text-rh-quiet"> ·{String(r.baseline_year).slice(2)}</span>}</td>
                    <td className="px-3 py-2.5 text-right font-plexmono font-semibold text-rh-ink">{r.latest}</td>
                    <td className="px-3 py-2.5 text-right">
                      {r.pct_change == null ? <span className="text-rh-quiet">—</span>
                        : <span className={`font-plexmono font-semibold ${r.pct_change > 0 ? "text-rh-alarm" : r.pct_change < 0 ? "text-rh-teal" : "text-rh-ink3"}`}>{r.pct_change > 0 ? "+" : ""}{r.pct_change}%</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right"><span className="font-plexmono font-semibold" style={{ color: xcap <= 1 ? "#0d6b62" : xcap <= 5 ? "#c07a12" : "#b8342a" }}>{xcap}×</span></td>
                    <td className="px-3 py-2.5"><Sparkline counts={(r.series ?? []).map((s) => s.count)} verdict={r.verdict} /></td>
                    <td className="px-[18px] py-2.5"><span className={`inline-flex whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold ${vc.cls}`}>{vc.label}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="px-[18px] py-8 text-center text-rh-ink3">No spill history to track yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* caveat */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-nodata bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">What this is — and what it is not</h2>
        <p className="mt-2 max-w-[820px] text-[13px] leading-[1.55] text-rh-ink2">
          This is <strong>River Hub&apos;s measurement, not the plan&apos;s.</strong> The reduction plan publishes no target for an individual overflow and no per-overflow progress — so we compare each outlet&apos;s EDM spill count to its 2020 baseline and the 10/year cap. The deadline shown is <strong>derived by proximity</strong> to a designated site, not an official determination, and the plan is a policy commitment rather than a statutory duty. Counts exclude spills under 15 minutes. A falling trend is progress, but only ≤10 by the deadline is compliance. Where 2020 data is thin the baseline falls back to the earliest year on record, shown beside it.
        </p>
      </div>
      </PageBody>
    </>
  );
}
