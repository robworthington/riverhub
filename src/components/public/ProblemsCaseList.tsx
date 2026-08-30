"use client";

import { useState } from "react";
import Link from "next/link";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";

export type { ProblemRow };

type FilterKey = "gaps" | "all" | (typeof PROBLEMS)[number]["key"];

function ProblemChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: color + "55", backgroundColor: color + "12" }}>
      {label}
    </span>
  );
}

export function ProblemsCaseList({ rows }: { rows: ProblemRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("gaps");
  const flagged = rows.filter((r) => r.weight > 0);
  const gaps = flagged.filter((r) => !r.has_action);

  const counts: Record<FilterKey, number> = {
    gaps: gaps.length,
    all: flagged.length,
    freq: flagged.filter((r) => r.w_freq > 0).length,
    long: flagged.filter((r) => r.w_long > 0).length,
    dry: flagged.filter((r) => r.w_dry > 0).length,
    prestw: flagged.filter((r) => r.w_prestw > 0).length,
    feed: flagged.filter((r) => r.w_feed > 0).length,
  };

  const shown = (filter === "gaps" ? gaps : filter === "all" ? flagged : flagged.filter((r) => (PROBLEMS.find((p) => p.key === filter)!.w(r) > 0)))
    .slice().sort((a, b) => b.weight - a.weight);

  const chips: { key: FilterKey; label: string }[] = [
    { key: "gaps", label: "Gaps" },
    { key: "all", label: "All flagged" },
    ...PROBLEMS.map((p) => ({ key: p.key as FilterKey, label: p.label })),
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`rounded-[2px] border px-2.5 py-1 text-[12px] font-semibold ${active ? "border-rh-ink bg-rh-ink text-white" : "border-rh-line bg-rh-card text-rh-ink2 hover:bg-rh-rowHover"}`}>
              {c.label} <span className={active ? "text-white/70" : "text-rh-ink3"}>{counts[c.key]}</span>
            </button>
          );
        })}
      </div>

      <p className="mb-3 max-w-[720px] text-[12px] text-rh-ink3">
        A <strong>gap</strong> is an overflow with a flagged problem and no measure linked to it. Linking is done in the members area — an unlinked overflow is not proof nothing is being done, but it is what the public record shows.
      </p>

      <div className="rounded-[3px] border border-rh-line bg-rh-card">
        {shown.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-[13px] text-rh-ink3">Nothing matches this filter.</p>
        ) : (
          shown.map((r) => {
            const fired = PROBLEMS.filter((p) => p.w(r) > 0);
            const top = fired.slice().sort((a, b) => b.w(r) - a.w(r))[0];
            return (
              <Link key={r.asset_id} href={`/explore/spills/${r.asset_id}`}
                className={`flex flex-col gap-2 border-b border-rh-rowDiv px-[18px] py-3 hover:bg-rh-rowHover sm:flex-row sm:items-center sm:gap-4 ${!r.has_action ? "border-l-[3px] border-l-[#e8b6ae]" : ""}`}>
                <div className="flex-[1_1_260px]">
                  <div className="text-[14.5px] font-semibold text-rh-ink">{r.asset_name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{fired.map((p) => <ProblemChip key={p.key} color={p.color} label={p.label} />)}</div>
                  {top && <div className="mt-1 text-[12px] text-rh-ink3">{top.ev(r)}</div>}
                </div>
                <div className="flex-[0_0_150px] text-[12.5px] text-rh-ink2">
                  {r.has_action ? "Measure linked" : <span className="text-rh-ink3">No measure on record</span>}
                </div>
                <div className="flex-[0_0_130px]">
                  {r.has_action
                    ? <span className="inline-flex rounded-[2px] border border-[#bcd4cf] bg-[#eaf1ef] px-2 py-0.5 text-[11.5px] font-semibold text-rh-teal">Action under way</span>
                    : <span className="inline-flex rounded-[2px] border border-[#e8b6ae] bg-rh-alarmTint px-2 py-0.5 text-[11.5px] font-semibold text-rh-alarm">No action recorded</span>}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
