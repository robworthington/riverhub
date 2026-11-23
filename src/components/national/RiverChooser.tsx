"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NearMe } from "@/components/national/NearMe";

export type ChooserRiver = {
  slug: string;
  river_name: string;
  region: string | null;
  org_name: string | null;
  overflows: number;
  gaps: number;
  logo_url: string | null;
  company_name?: string | null;
  district_slug?: string | null;
  district_name?: string | null;
};

type Lens = "district" | "company" | "az" | "near";

const LAST_RIVER_KEY = "riverhub:last-river";
const LENSES: { key: Lens; label: string }[] = [
  { key: "district", label: "By river basin district" },
  { key: "company", label: "By water company" },
  { key: "az", label: "A to Z" },
  { key: "near", label: "Near me" },
];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

type Group = { key: string; title: string; href?: string; rivers: ChooserRiver[] };

function groupRivers(rivers: ChooserRiver[], lens: Lens): Group[] {
  if (lens === "az") {
    return [{ key: "all", title: "", rivers: [...rivers].sort((a, b) => a.river_name.localeCompare(b.river_name)) }];
  }
  const map = new Map<string, Group>();
  for (const r of rivers) {
    const key = lens === "district" ? r.district_slug ?? "_none" : r.company_name ?? "_none";
    const title =
      lens === "district"
        ? r.district_name ? `${r.district_name} river basin district` : "District not yet assigned"
        : r.company_name ?? "Company not recorded";
    const href = lens === "district" && r.district_slug ? `/d/${r.district_slug}` : undefined;
    const g = map.get(key) ?? { key, title, href, rivers: [] };
    g.rivers.push(r);
    map.set(key, g);
  }
  // Biggest groups first; rivers within a group keep the incoming order (most gaps first).
  return [...map.values()].sort((a, b) => b.rivers.length - a.rivers.length || a.title.localeCompare(b.title));
}

/** River chooser: cards routing to each river's portal, grouped by river basin district, water
 *  company or A to Z, with a filter and a "continue where you left off" shortcut. */
export function RiverChooser({ rivers }: { rivers: ChooserRiver[] }) {
  // Districts come from migration 0094; until a database has them, start on A to Z and hide that lens
  // rather than showing every river as "District not yet assigned".
  const hasDistricts = rivers.some((r) => r.district_slug);
  const lenses = hasDistricts ? LENSES : LENSES.filter((l) => l.key !== "district");
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<Lens>(hasDistricts ? "district" : "az");
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLast(localStorage.getItem(LAST_RIVER_KEY));
    } catch {
      /* private mode / blocked storage: no shortcut, no error */
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
    ? rivers.filter((r) =>
        [r.river_name, r.region, r.district_name, r.company_name, r.org_name]
          .some((v) => (v ?? "").toLowerCase().includes(needle)),
      )
    : rivers;
  const groups = groupRivers(shown, lens);
  const lastRiver = last ? rivers.find((r) => r.slug === last) : null;

  return (
    <div className="space-y-4">
      {lastRiver && (
        <Link
          href={`/r/${lastRiver.slug}/explore/spills`}
          className={`flex items-center justify-between gap-3 rounded-[6px] border border-brand-line2 bg-brand-band px-5 py-3 text-[14px] hover:border-brand-navy ${focusRing}`}
        >
          <span>
            Continue where you left off —{" "}
            <strong className="text-brand-navyDeep">{lastRiver.river_name}</strong>
          </span>
          <span aria-hidden className="text-brand-navy">→</span>
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {lens !== "near" && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a river, district or water company…"
          className="min-w-[220px] flex-1 rounded-[5px] border border-brand-line5 px-4 py-2.5 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
          aria-label="Find a river"
        />
        )}
        <div role="group" aria-label="Group rivers" className="flex flex-wrap gap-1 rounded-[6px] bg-brand-tabIdle p-1">
          {lenses.map((l) => (
            <button
              key={l.key}
              type="button"
              aria-pressed={lens === l.key}
              onClick={() => setLens(l.key)}
              className={`min-h-[36px] rounded-[4px] px-3 text-[13.5px] transition-colors ${focusRing} ${
                lens === l.key ? "bg-white font-semibold text-brand-navyDeep shadow-sm" : "text-brand-body hover:text-brand-navyDeep"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {lens === "near" && <NearMe onPick={remember} />}

      {lens !== "near" && groups.map((g) => (
        <section key={g.key} className="space-y-2.5" aria-label={g.title || "All rivers"}>
          {g.title && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
              <h3 className="font-serif text-[19px] font-bold text-brand-navyDeep">
                {g.title}{" "}
                <span className="font-sans text-[13px] font-normal text-brand-label">
                  · {g.rivers.length} {g.rivers.length === 1 ? "river" : "rivers"}
                </span>
              </h3>
              {g.href && (
                <Link href={g.href} className={`text-[13.5px] font-semibold text-brand-navy hover:underline ${focusRing}`}>
                  District page →
                </Link>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.rivers.map((r) => (
              <Link
                key={r.slug}
                href={`/r/${r.slug}/explore/spills`}
                onClick={() => remember(r.slug)}
                className={`flex flex-col gap-2 rounded-[6px] border border-brand-line2 bg-white px-5 py-4 transition-colors hover:border-brand-navy ${focusRing}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {r.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo_url} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
                    )}
                    <span className="truncate font-serif text-[18px] font-bold text-brand-navyDeep">{r.river_name}</span>
                  </span>
                  {lens !== "company" && r.company_name && (
                    <span className="shrink-0 text-[12px] text-brand-label">{r.company_name}</span>
                  )}
                  {lens === "company" && r.district_name && (
                    <span className="shrink-0 text-[12px] text-brand-label">{r.district_name}</span>
                  )}
                </div>
                <div className="flex gap-4 text-[12.5px] text-brand-body">
                  <span><strong className="font-plexmono text-brand-navyDeep">{r.overflows}</strong> overflows</span>
                  <span><strong className="font-plexmono text-rh-alarm">{r.gaps}</strong> gaps</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {lens !== "near" && shown.length === 0 && (
        <p className="text-[13px] text-brand-placeholder">No rivers match &ldquo;{q}&rdquo;.</p>
      )}
    </div>
  );
}
