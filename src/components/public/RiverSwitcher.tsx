"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { switchRiverPath } from "@/lib/nav-config";
import { riverMatches } from "@/lib/nation";
import { RiverName } from "@/components/RiverName";

export type SwitcherRiver = { slug: string; river_name: string; river_name_cy?: string | null; gaps: number };

// Shared with the national RiverChooser: its "Continue where you left off" reads LAST_RIVER_KEY.
const LAST_RIVER_KEY = "riverhub:last-river";
const RECENT_KEY = "riverhub:recent-rivers";
const RECENT_MAX = 4;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function portalPathOf(pathname: string): string {
  return pathname.replace(/^\/r\/[^/]+/, "") || "/explore/spills";
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

/**
 * Public river switcher (national navigation, step 1). The current river's name is the trigger; the
 * panel lists every live river with a filter and the rivers viewed recently. Picking a river keeps
 * the page you are on when that page exists for every river (Dart Gaps -> Teign Gaps), otherwise its
 * section page. Visiting a river records it, which also feeds the home page's "continue" shortcut.
 */
export function RiverSwitcher({
  current,
  currentName,
  currentNameCy = null,
  rivers,
  nationalHref,
  neighbours = [],
  district = null,
  coverage = "England",
}: {
  current: string;
  currentName: string;
  /** A Welsh river's Welsh name: shown first on the button, the English name under it. */
  currentNameCy?: string | null;
  rivers: SwitcherRiver[];
  nationalHref: string | null;
  /** The rivers next to this one (closest overflows), nearest first. */
  neighbours?: SwitcherRiver[];
  /** This river's river basin district, for an "All N in <district>" link. */
  district?: { name: string; href: string; count: number } | null;
  /** "England", or "England and Wales" once a Welsh river is live (lib/nation). */
  coverage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const pathname = usePathname() ?? "/explore/spills";
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const inputId = useId();

  // Record this visit: most-recent-first, current river included so it shows up from other rivers.
  useEffect(() => {
    try {
      const next = [current, ...readRecent().filter((s) => s !== current)].slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      localStorage.setItem(LAST_RIVER_KEY, current);
      setRecent(next);
    } catch {
      /* private mode / blocked storage: no recents, no error */
    }
  }, [current]);

  // Close on outside click and Escape (focus back to the trigger).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close when the route changes (a river was picked).
  useEffect(() => {
    setOpen(false);
    setQ("");
  }, [pathname]);

  const target = switchRiverPath(portalPathOf(pathname));
  const bySlug = useMemo(() => new Map(rivers.map((r) => [r.slug, r])), [rivers]);
  const sorted = useMemo(
    () => [...rivers].sort((a, b) => a.river_name.localeCompare(b.river_name)),
    [rivers],
  );
  const needle = q.trim().toLowerCase();
  const others = sorted.filter((r) => r.slug !== current);
  const shown = needle ? others.filter((r) => riverMatches(needle, r.river_name, r.river_name_cy)) : others;
  const nearby = needle ? [] : neighbours.filter((n) => n.slug !== current && bySlug.has(n.slug));
  const nearbySlugs = new Set(nearby.map((n) => n.slug));
  const recentRivers = needle
    ? []
    : recent
        .filter((s) => s !== current && !nearbySlugs.has(s))
        .map((s) => bySlug.get(s))
        .filter((r): r is SwitcherRiver => !!r);
  const pageLabel = target === "/explore/spills" ? "the live board" : "this page";

  const row = (r: SwitcherRiver) => (
    <li key={r.slug}>
      {/* A full page load, not <Link>: the river's branding and header live in the (public) layout,
          which sits above /r/[river] and so is not re-rendered by a client-side river change. */}
      <a
        href={`/r/${r.slug}${target}`}
        className={`flex min-h-[44px] items-center justify-between gap-3 rounded-[5px] px-3 py-2 text-[14.5px] font-semibold text-brand-navyDeep hover:bg-brand-surfaceSel ${focusRing}`}
      >
        <span className="truncate">
          <RiverName name={r.river_name} cy={r.river_name_cy ?? bySlug.get(r.slug)?.river_name_cy} secondaryClassName="text-[13px] font-normal text-brand-muted" />
        </span>
        {r.gaps > 0 && (
          <span className="shrink-0 font-plexmono text-[12.5px] font-medium text-brand-accent">
            {r.gaps} {r.gaps === 1 ? "gap" : "gaps"}
          </span>
        )}
      </a>
    </li>
  );

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 min-w-0 max-w-full items-center gap-2.5 rounded-[6px] border px-3 text-left transition-colors ${
          open ? "border-brand-navy bg-brand-surfaceSel" : "border-brand-line5 bg-white hover:border-brand-navy"
        } ${focusRing}`}
      >
        <span className="flex min-w-0 flex-col leading-[1.15]">
          {currentNameCy ? (
            <>
              <span lang="cy" className="truncate text-[15px] font-bold text-brand-navyDeep">{currentNameCy}</span>
              <span className="truncate text-[11.5px] text-brand-muted">{currentName} · Change river</span>
            </>
          ) : (
            <>
              <span className="truncate text-[15px] font-bold text-brand-navyDeep">{currentName}</span>
              <span className="text-[11.5px] text-brand-muted">Change river</span>
            </>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-brand-navy transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Change river"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-[14px] border border-brand-line5 bg-white shadow-[0_12px_32px_rgba(18,49,75,.22)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+8px)] sm:max-h-[min(560px,70vh)] sm:w-[400px] sm:rounded-[8px]"
        >
          <div className="flex flex-col gap-2 border-b border-brand-line3 px-4 pb-3 pt-3.5">
            <label htmlFor={inputId} className="text-[12px] font-semibold uppercase tracking-[.1em] text-brand-muted">
              Go to another river
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a river name, in English or Welsh"
              className="h-10 rounded-[5px] border border-brand-line5 px-3 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
            />
            <span className="text-[12.5px] text-brand-body">
              Opens <strong className="text-brand-navyDeep">{pageLabel}</strong> for the river you pick.
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {nearby.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-1 text-[11.5px] font-semibold uppercase tracking-[.1em] text-brand-label">Next to {currentName}</p>
                <ul className="mb-2">{nearby.map(row)}</ul>
              </>
            )}
            {recentRivers.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-1 text-[11.5px] font-semibold uppercase tracking-[.1em] text-brand-label">Recently viewed</p>
                <ul className="mb-2">{recentRivers.map(row)}</ul>
              </>
            )}
            {(nearby.length > 0 || recentRivers.length > 0) && (
              <>
                <p className="border-t border-brand-line3 px-3 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[.1em] text-brand-label">All rivers</p>
              </>
            )}
            <ul>{shown.map(row)}</ul>
            {shown.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-brand-placeholder">No rivers match &ldquo;{q}&rdquo;.</p>
            )}
          </div>

          {(nationalHref || district) && (
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-brand-line2 bg-brand-surface px-4 py-3 text-[13.5px]">
              {district && (
                <a href={district.href} className={`font-semibold text-brand-navy hover:underline ${focusRing}`}>
                  All {district.count} in {district.name} →
                </a>
              )}
              {nationalHref && (
                <a href={nationalHref} className={`font-semibold text-brand-navy hover:underline ${focusRing}`}>
                  All rivers in {coverage} →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
