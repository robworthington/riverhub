import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";
import { OverflowName } from "@/components/public/OverflowName";
import { prettyWorksName } from "@/lib/overflowNames";

// Rendered per-request against the live DB. These data pages call heavy full-catchment
// RPCs; prerendering them at build risks caching a transient-empty result until the next
// revalidation, so we render dynamically instead. (See TEIGN-ROLLOUT §6 / the ISR stale-empty pattern.)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Gaps — ${INSTANCE.portalName}`,
  description: `Overflows in the ${INSTANCE.riverName} catchment with a flagged problem and no measure recorded against them — ranked by severity. The headline gap in the public record.`,
};

export default async function GapsPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_problems" as never, {} as never);
  const rows = (data ?? []) as unknown as ProblemRow[];

  const tracked = rows.length;
  const flagged = rows.filter((r) => r.weight > 0);
  const gaps = flagged.filter((r) => !r.has_action).sort((a, b) => b.weight - a.weight);
  const gapHours = gaps.reduce((s, r) => s + r.hours_lfy, 0);
  const gapDry = gaps.reduce((s, r) => s + r.dry, 0);

  return (
    <div className="space-y-7 py-2">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Gaps</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">A gap is an overflow with a flagged problem and no measure recorded against it — the clearest thing on this site to put to a regulator.</p>
      </div>

      {/* headline banner */}
      <div className="rounded-[3px] border border-[#e8b6ae] border-l-[4px] border-l-rh-alarm bg-rh-alarmTint px-[26px] py-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-plexmono text-[48px] font-bold leading-none text-rh-alarm">{gaps.length}</span>
          <span className="text-[14px] text-rh-ink2">of {tracked} overflows</span>
        </div>
        <p className="mt-3 max-w-[760px] text-[20px] font-bold leading-[1.3] text-rh-ink">
          {gaps.length} overflow{gaps.length === 1 ? "" : "s"} {gaps.length === 1 ? "has" : "have"} a known problem and no measure recorded against {gaps.length === 1 ? "it" : "them"}.
        </p>
        <p className="mt-2 max-w-[760px] text-[13.5px] leading-[1.55] text-rh-ink2">
          Between them these overflows account for about {gapHours.toLocaleString()} hours of discharge in the last full year and {gapDry.toLocaleString()} dry-weather spills since 2020. A dry-weather spill has no rainfall to excuse it — on any reading of regulation 4, that is a prima facie breach with nothing on record to address it.
        </p>
      </div>

      {/* ranking explainer */}
      <div className="rounded-[3px] bg-rh-cardAlt px-[22px] py-4">
        <p className="max-w-[820px] text-[13px] leading-[1.55] text-rh-ink2">
          Each flagged problem carries a weight that scales with its magnitude; an overflow&apos;s <strong>severity</strong> is the sum of its weights. A gap is a flagged overflow with no measure linked to it. <strong>An unlinked overflow is not proof that nothing is being done — it is what the public record shows.</strong> <Link href="/explore/spills/method" className="text-rh-teal hover:underline">How we weight problems →</Link>
        </p>
      </div>

      {/* gap cards, severity-ranked */}
      <div className="space-y-2.5">
        {gaps.map((r, i) => {
          const fired = PROBLEMS.filter((p) => p.w(r) > 0).sort((a, b) => b.w(r) - a.w(r));
          const top = fired[0];
          const preDominant = top?.key === "prestw";
          return (
            <Link key={r.asset_id} href={`/explore/spills/${r.asset_id}`}
              className="flex flex-col gap-3 rounded-[3px] border border-rh-line border-l-[4px] bg-rh-card px-[18px] py-3.5 hover:bg-rh-rowHover sm:flex-row sm:items-center"
              style={{ borderLeftColor: preDominant ? "#9a4415" : "#b8342a" }}>
              <div className="flex w-[64px] shrink-0 items-baseline gap-2">
                <span className="font-plexmono text-[15px] font-bold text-rh-ink">{i + 1}</span>
                <span className="font-plexmono text-[11px] text-rh-quiet">wt {r.weight}</span>
              </div>
              <div className="flex-[1_1_300px]">
                <div className="text-[14.5px] font-semibold text-rh-ink"><OverflowName raw={r.asset_name} /></div>
                <div className="font-plexmono text-[11px] text-rh-quiet">{r.asset_code ?? "—"}{r.system_name ? ` · to ${prettyWorksName(r.system_name)}` : ""}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {fired.map((p) => (
                    <span key={p.key} className="inline-flex rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: p.color, borderColor: p.color + "55", backgroundColor: p.color + "12" }}>{p.label}</span>
                  ))}
                </div>
              </div>
              <div className="flex-[0_0_200px] text-[12.5px] text-rh-ink2">{top ? top.ev(r) : "—"}</div>
              <div className="flex-[0_0_140px]">
                <span className="inline-flex rounded-[2px] border border-[#e8b6ae] bg-rh-alarmTint px-2 py-0.5 text-[11.5px] font-semibold text-rh-alarm">No measure recorded</span>
              </div>
            </Link>
          );
        })}
        {gaps.length === 0 && <p className="rounded-[3px] border border-rh-line bg-rh-card px-[18px] py-8 text-center text-[13px] text-rh-ink3">No gaps — every flagged overflow has a measure linked to it.</p>}
      </div>

      {/* comparison panel */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">What is funded, and where</h2>
        <p className="mt-2 max-w-[820px] text-[13px] leading-[1.55] text-rh-ink2">
          South West Water reports 291 funded overflow improvements across its region, and Ofwat has secured £24m in section 19 undertakings — including £20m to reduce discharges at specific overflows in sensitive and community areas. Which overflows those schemes cover, and whether any of them address the gaps above, is a fair question to put to the company in writing.
        </p>
      </div>
    </div>
  );
}
