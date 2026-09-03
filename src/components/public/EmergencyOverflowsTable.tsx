"use client";

import { useState } from "react";
import { type EoRow, fmtHours, eoDisplayName, commissionedLabel } from "@/lib/emergencyOverflows";
import { prettyWorksName } from "@/lib/overflowNames";

type SortKey = "total" | "worst" | "latest" | "name";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

// Colour a year cell by how many hours it discharged — quiet grey up to a red for a bad year.
function cellStyle(hours: number, monitored: boolean): React.CSSProperties {
  if (!monitored) return { color: "#b8c1c2" };
  if (hours === 0) return { color: "#9aa7a8" };
  if (hours >= 500) return { color: "#b8342a", fontWeight: 700 };
  if (hours >= 100) return { color: "#9a4415", fontWeight: 600 };
  if (hours >= 10) return { color: "#3a4c4e" };
  return { color: "#6b7778" };
}

export function EmergencyOverflowsTable({ rows }: { rows: EoRow[] }) {
  const [sort, setSort] = useState<SortKey>("total");

  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return eoDisplayName(a.overflow_name).localeCompare(eoDisplayName(b.overflow_name));
    if (sort === "worst") return (b.worst_hours ?? 0) - (a.worst_hours ?? 0);
    if (sort === "latest") return (b.latest_hours ?? 0) - (a.latest_hours ?? 0);
    return b.total_hours - a.total_hours;
  });

  const Th = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-2 font-semibold ${className}`}>
      <button onClick={() => setSort(k)} className={`inline-flex items-center gap-1 hover:text-rh-teal ${sort === k ? "text-rh-teal" : ""}`}>
        {label}
        <span className="text-[9px]">{sort === k ? "▼" : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
      <table className="min-w-[860px] w-full text-[13px]">
        <thead>
          <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] uppercase tracking-[.06em] text-rh-label">
            <Th k="name" label="Emergency overflow" className="text-left" />
            {YEARS.map((y) => (
              <th key={y} className="px-2 py-2 text-right font-semibold">{y === 2025 ? "25 ytd" : `’${String(y).slice(2)}`}</th>
            ))}
            <Th k="total" label="Total hrs" className="text-right" />
            <th className="px-3 py-2 text-right font-semibold">Spills</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const byYear = new Map(r.years.map((y) => [y.year, y]));
            const bad = r.total_hours >= 500;
            return (
              <tr key={r.id} className="border-b border-rh-rowDiv align-top hover:bg-rh-rowHover">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-rh-ink" style={bad ? { color: "#b8342a" } : undefined}>{eoDisplayName(r.overflow_name)}</div>
                  <div className="font-plexmono text-[10.5px] text-rh-quiet">
                    {r.permit_ref}{r.system_name ? ` · ${prettyWorksName(r.system_name)} works` : ""} · EDM {commissionedLabel(r.edm_commissioned)}
                  </div>
                </td>
                {YEARS.map((y) => {
                  const cell = byYear.get(y);
                  const hours = cell?.hours ?? 0;
                  const mon = cell?.monitored ?? false;
                  return (
                    <td key={y} className="px-2 py-2.5 text-right font-plexmono text-[12px]" style={cellStyle(hours, mon)}
                      title={!mon ? "No EDM monitor that year" : `${cell?.spills ?? 0} spills · ${fmtHours(hours)} hours`}>
                      {!mon ? "—" : hours === 0 ? "·" : fmtHours(hours)}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right font-plexmono font-semibold text-rh-ink">{fmtHours(r.total_hours)}</td>
                <td className="px-3 py-2.5 text-right font-plexmono text-rh-ink2">{r.total_spills.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-rh-lineSoft px-3 py-2 text-[11px] text-rh-ink3">
        Hours discharged per year. <span className="font-plexmono">—</span> = no monitor yet · <span className="font-plexmono">·</span> = monitored, no spills · <span className="font-plexmono">25 ytd</span> = 2025 so far. Counts use the EA 12/24-hour block method.
      </div>
    </div>
  );
}
