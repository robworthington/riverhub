"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type ChooserRiver = {
  slug: string;
  river_name: string;
  region: string | null;
  org_name: string | null;
  overflows: number;
  gaps: number;
};

const LAST_RIVER_KEY = "riverhub:last-river";

/** River chooser (workstream D3): cards routing to each river's portal, with a "continue where you
 *  left off" shortcut remembered in localStorage. */
export function RiverChooser({ rivers }: { rivers: ChooserRiver[] }) {
  const [q, setQ] = useState("");
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLast(localStorage.getItem(LAST_RIVER_KEY));
    } catch {
      /* private mode / blocked storage — no shortcut, no error */
    }
  }, []);

  function remember(slug: string) {
    try {
      localStorage.setItem(LAST_RIVER_KEY, slug);
    } catch {
      /* ignore */
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rivers.filter(
        (r) =>
          r.river_name.toLowerCase().includes(needle) ||
          (r.region ?? "").toLowerCase().includes(needle),
      )
    : rivers;

  const lastRiver = last ? rivers.find((r) => r.slug === last) : null;

  return (
    <div className="space-y-4">
      {lastRiver && (
        <Link
          href={`/r/${lastRiver.slug}/explore/spills`}
          className="flex items-center justify-between gap-3 rounded-[6px] border border-brand-line2 bg-brand-band px-5 py-3 text-[14px] hover:border-brand-navy"
        >
          <span>
            Continue where you left off —{" "}
            <strong className="text-brand-navyDeep">{lastRiver.river_name}</strong>
          </span>
          <span aria-hidden className="text-brand-navy">→</span>
        </Link>
      )}

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a river or region…"
        className="w-full rounded-[5px] border border-brand-line2 px-4 py-2.5 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
        aria-label="Find a river"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((r) => (
          <Link
            key={r.slug}
            href={`/r/${r.slug}/explore/spills`}
            onClick={() => remember(r.slug)}
            className="flex flex-col gap-2 rounded-[6px] border border-brand-line2 bg-white px-5 py-4 transition-colors hover:border-brand-navy"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-[18px] font-bold text-brand-navyDeep">{r.river_name}</span>
              {r.region && <span className="text-[12px] text-brand-label">{r.region}</span>}
            </div>
            <div className="flex gap-4 text-[12.5px] text-brand-body">
              <span><strong className="font-plexmono text-brand-navyDeep">{r.overflows}</strong> overflows</span>
              <span><strong className="font-plexmono text-rh-alarm">{r.gaps}</strong> gaps</span>
            </div>
          </Link>
        ))}
        {shown.length === 0 && (
          <p className="text-[13px] text-brand-placeholder">No rivers match &ldquo;{q}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}
