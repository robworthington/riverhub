"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// The "SPILL RECORDS FOR" period selector. Sets ?period= while preserving other query params, so the
// history columns are shareable. Live status is never period-scoped (the note says so).
export type Period = { value: string; label: string };

export function PeriodBar({
  periods,
  current,
  label = "Spill records for",
  note = "Live status is always current — the period only changes the history columns.",
}: {
  periods: Period[];
  current: string;
  label?: string;
  note?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", value);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[3px] border border-rh-line bg-rh-well px-4 py-3">
      <span className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-[#55645f]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {periods.map((p) => {
          const active = p.value === current;
          return (
            <Link
              key={p.value}
              href={hrefFor(p.value)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={`rounded-[3px] border px-[11px] py-[5px] font-plexmono text-[12.5px] font-semibold ${
                active
                  ? "border-rh-teal bg-rh-teal text-white"
                  : "border-[#d5cfc2] bg-rh-card text-rh-ink hover:bg-rh-rowHover"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      {note && <span className="ml-auto text-[11.5px] text-rh-ink3">{note}</span>}
    </div>
  );
}
