"use client";

import { useState } from "react";
import Link from "next/link";
import { BASIS_META, type CountBasis, countLabel } from "@/lib/spillCounts";

type YearRow = { year: number; dry: number; wet: number; total: number; hours: number; counted: number };

// The record since 2020, with a toggle between the EA's counted spills (12/24-hour
// block method — the basis of the 10-a-year cap) and River Hub's discharge events
// (every discrete discharge over 15 min). Counted spills have no dry/wet split, so
// those bars are solid; discharge-event bars keep the dry/wet stack.
export function YearBars({
  years,
  selectedYear,
  dryAll,
  preStwAll,
}: {
  years: YearRow[];
  selectedYear: number;
  dryAll: number;
  preStwAll: number;
}) {
  const [basis, setBasis] = useState<CountBasis>("counted");
  const val = (y: YearRow) => (basis === "counted" ? y.counted : y.total);
  const maxVal = Math.max(1, ...years.map(val));
  const sel = years.find((y) => y.year === selectedYear);

  return (
    <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-rh-ink">The record since 2020</h2>
          <p className="mt-1 text-[12.5px] text-rh-ink3">
            {dryAll} dry spills and {preStwAll} pre-STW spills since 2020. Pick a year to see its events below.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">Count by</span>
          <div className="inline-flex overflow-hidden rounded-[3px] border border-rh-line" role="group" aria-label="Count basis">
            {(["counted", "events"] as CountBasis[]).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                title={BASIS_META[b].hint}
                aria-pressed={basis === b}
                className={`px-2.5 py-1.5 text-[12px] font-semibold ${basis === b ? "bg-rh-ink text-white" : "bg-rh-card text-rh-ink2 hover:bg-rh-rowHover"}`}
              >
                {b === "counted" ? "Spills" : "Discharge events"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sel && (
        <p className="mt-2 text-[12.5px] text-rh-ink2">
          <span className="font-semibold text-rh-ink">{selectedYear}:</span>{" "}
          {basis === "counted"
            ? <>{countLabel(sel.counted, "counted")} <span className="text-rh-ink3">· {countLabel(sel.total, "events")}</span></>
            : <>{countLabel(sel.total, "events")} <span className="text-rh-ink3">· {countLabel(sel.counted, "counted")}</span></>}
        </p>
      )}

      <div className="mt-4 flex items-end gap-2.5" style={{ height: 150 }}>
        {years.map((y) => {
          const v = val(y);
          const h = (v / maxVal) * 118;
          return (
            <Link key={y.year} href={`?year=${y.year}`} scroll={false} className="flex flex-1 flex-col items-center justify-end gap-1 text-center">
              <span className="font-plexmono text-[11px] text-rh-ink3">{v}</span>
              <span className="flex w-full max-w-[42px] flex-col justify-end overflow-hidden rounded-t-[2px]" style={{ height: Math.max(4, h) }}>
                {basis === "counted" ? (
                  <span className="w-full bg-rh-teal" style={{ height: "100%" }} />
                ) : (
                  <>
                    <span className="w-full bg-rh-dry" style={{ height: `${(y.dry / Math.max(1, y.total)) * 100}%` }} />
                    <span className="w-full bg-rh-wet" style={{ height: `${(y.wet / Math.max(1, y.total)) * 100}%` }} />
                  </>
                )}
              </span>
              <span className={`mt-1 rounded px-1.5 text-[11px] ${y.year === selectedYear ? "bg-rh-well font-bold text-rh-ink" : "text-[#7a8788]"}`}>{y.year}</span>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-[11.5px] text-rh-ink3">
        {basis === "counted"
          ? "Counted spills — the EA's 12/24-hour block method, the basis of the 10-a-year cap. Published annual return where available, computed the same way for the current year."
          : "Discharge events — every discrete discharge over 15 minutes, split into dry and wet weather."}{" "}
        <Link href="/explore/spills/method#counting" className="text-rh-teal hover:underline">Two ways to count →</Link>
      </p>
    </div>
  );
}
