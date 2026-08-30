import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { ProblemsCaseList } from "@/components/public/ProblemsCaseList";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Problems & action — ${INSTANCE.portalName}`,
  description: `Which overflows in the ${INSTANCE.riverName} catchment have a known problem, which have a measure recorded against them, and which are gaps — a problem with no action.`,
};

type WorksRow = {
  system_id: string; system_name: string; load_pct: number | null;
  verdict: "over" | "limit" | "within" | "not_assessed"; diagnosis: "capacity" | "upstream" | "both" | "not_assessed" | "none";
  pre_stw_count: number;
};

export default async function ProblemsActionPage() {
  const supabase = createPublicClient();
  const [{ data: pData }, { data: wData }] = await Promise.all([
    supabase.rpc("public_spills_problems" as never, {} as never),
    supabase.rpc("public_spills_works" as never, {} as never),
  ]);
  const rows = (pData ?? []) as unknown as ProblemRow[];
  const works = (wData ?? []) as unknown as WorksRow[];

  const tracked = rows.length;
  const flagged = rows.filter((r) => r.weight > 0);
  const withAction = flagged.filter((r) => r.has_action);
  const gaps = flagged.filter((r) => !r.has_action);

  const funnel = [
    { label: "Overflows tracked", value: tracked, color: "#4b5c5e" },
    { label: "Flagged by analysis", value: flagged.length, color: "#101b1d" },
    { label: "Action under way", value: withAction.length, color: "#0d6b62" },
    { label: "No action at all", value: gaps.length, color: "#b8342a" },
  ];

  // works with a capacity/upstream problem, worst first
  const worksProblems = works
    .filter((w) => w.verdict === "over" || w.verdict === "limit" || w.diagnosis === "upstream" || w.diagnosis === "both" || w.diagnosis === "capacity")
    .sort((a, b) => (b.load_pct ?? -1) - (a.load_pct ?? -1));

  return (
    <div className="space-y-7 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>

      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Problems & action</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">
          The analysis flags overflows that are misbehaving. This page asks the next question: is anyone doing anything about them? An overflow with a flagged problem and no measure recorded against it is a <strong>gap</strong>.
        </p>
      </div>

      {/* headline banner */}
      <div className="rounded-[3px] bg-rh-ink px-[26px] py-6 text-[#e8efee]">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-[#8fa5a3]">The headline number</p>
        <p className="mt-2 max-w-[760px] text-[24px] font-bold leading-[1.3] tracking-[-0.02em]">
          <span className="text-[#f0a59c]">{gaps.length} overflow{gaps.length === 1 ? "" : "s"}</span> {gaps.length === 1 ? "has" : "have"} a known problem and no action recorded against {gaps.length === 1 ? "it" : "them"}.
        </p>
      </div>

      {/* funnel */}
      <div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
          {funnel.map((f) => (
            <div key={f.label} className="rounded-[3px] border border-rh-line border-l-[4px] bg-rh-card px-4 py-3.5" style={{ borderLeftColor: f.color }}>
              <div className="font-plexmono text-[30px] font-bold leading-none" style={{ color: f.color }}>{f.value}</div>
              <div className="mt-1.5 text-[12px] font-semibold text-rh-ink2">{f.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-rh-ink3">Read left to right: everything we track, what the analysis flags, and how far the response gets.</p>
      </div>

      {/* problem x response matrix */}
      <div>
        <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Problem by response</h2>
        <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
          <table className="min-w-[520px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                <th className="px-[18px] py-2 text-left font-semibold">Problem</th>
                <th className="px-3 py-2 text-right font-semibold">Flagged</th>
                <th className="px-3 py-2 text-right font-semibold">Action under way</th>
                <th className="px-[18px] py-2 text-right font-semibold">No action</th>
              </tr>
            </thead>
            <tbody>
              {PROBLEMS.map((p) => {
                const fl = flagged.filter((r) => p.w(r) > 0);
                const act = fl.filter((r) => r.has_action).length;
                const no = fl.length - act;
                return (
                  <tr key={p.key} className="border-b border-rh-rowDiv">
                    <td className="px-[18px] py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: p.color }} />
                        <span className="font-semibold text-rh-ink">{p.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-plexmono text-rh-ink">{fl.length || <span className="text-rh-ink3">0</span>}</td>
                    <td className="px-3 py-2.5 text-right font-plexmono text-rh-teal">{act || <span className="text-rh-ink3">0</span>}</td>
                    <td className={`px-[18px] py-2.5 text-right font-plexmono font-semibold ${no > 0 ? "text-rh-alarm" : "text-rh-ink3"}`}>{no}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-rh-ink3">An overflow can carry more than one problem, so rows overlap. A measure linked to an overflow counts as action against every problem it has.</p>
      </div>

      {/* capacity problems (works level) */}
      {worksProblems.length > 0 && (
        <div>
          <h2 className="mb-2 text-[16px] font-bold text-rh-ink">Capacity problems, at the works</h2>
          <p className="mb-3 max-w-[720px] text-[12.5px] text-rh-ink3">
            These sit a level above individual overflows — the accountable body and the remedy differ. <Link href="/explore/spills/works" className="text-rh-teal hover:underline">Full capacity view →</Link>
          </p>
          <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
            <table className="min-w-[520px] w-full text-[13px]">
              <thead>
                <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                  <th className="px-[18px] py-2 text-left font-semibold">Works</th>
                  <th className="px-3 py-2 text-right font-semibold">Load</th>
                  <th className="px-[18px] py-2 text-left font-semibold">What it points to</th>
                </tr>
              </thead>
              <tbody>
                {worksProblems.map((w) => (
                  <tr key={w.system_id} className="border-b border-rh-rowDiv">
                    <td className="px-[18px] py-2.5 font-semibold text-rh-ink">{w.system_name}</td>
                    <td className="px-3 py-2.5 text-right font-plexmono" style={{ color: w.verdict === "over" ? "#b8342a" : w.verdict === "limit" ? "#c07a12" : "#4b5c5e" }}>
                      {w.load_pct != null ? `${w.load_pct}%` : "—"}
                    </td>
                    <td className="px-[18px] py-2.5 text-rh-ink2">
                      {w.diagnosis === "capacity" ? "Treatment capacity" : w.diagnosis === "upstream" ? "Network faults upstream" : w.diagnosis === "both" ? "Capacity and upstream faults" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* per-overflow case rows */}
      <div>
        <h2 className="mb-3 text-[16px] font-bold text-rh-ink">Problems at individual overflows</h2>
        <ProblemsCaseList rows={rows} />
      </div>
    </div>
  );
}
