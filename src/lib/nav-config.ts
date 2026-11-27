// Single source of truth for the app navigation (sidebar sections + their tabs).
// Used by Sidebar, SectionTabs and active-state resolution.

import type { Task } from "@/lib/tasks";

export interface NavTab {
  label: string;
  href: string;
  /** Shown only to members holding this task in their current group (migration 0126). */
  task?: Task;
}

/** Tabs or links the member may see, given their tasks. */
export function visibleFor<T extends { task?: Task }>(items: T[], tasks: readonly string[]): T[] {
  return items.filter((t) => !t.task || tasks.includes(t.task));
}

export interface NavSection {
  key: string;
  label: string;
  icon?: string;
  href: string; // default destination
  paths: string[]; // route prefixes that belong to this section
  cta?: boolean; // styled as the primary action
  tabs?: NavTab[];
  /** Public portal: compact label for the one-row header bar (the page band still shows `label`). */
  shortLabel?: string;
  /** Public portal: false keeps the section for active-state matching but leaves it out of the
   *  primary nav (e.g. "Why River Hub", now linked from the footer and the national home). */
  primary?: boolean;
}

export const SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    paths: ["/dashboard"],
  },
  {
    key: "water-quality",
    label: "Water quality",
    href: "/sites",
    // test types and the import API keys moved here from the cog menu (Nov 2026)
    paths: ["/sites", "/results", "/test-types", "/admin/api-keys"],
    tabs: [
      { label: "Sites", href: "/sites" },
      { label: "Results", href: "/results" },
      { label: "Test types", href: "/test-types", task: "sampling" },
    ],
  },
  {
    key: "sewage",
    label: "Sewage",
    href: "/sewage-systems",
    paths: ["/assets", "/sewage-systems", "/measures"],
    // the overflow list moved to the public board (Nov 2026); /assets/<id> is "Manage this overflow"
    tabs: [
      { label: "Systems", href: "/sewage-systems" },
      { label: "WINEP linking", href: "/measures/unlinked", task: "regulatory" },
    ],
  },
  {
    key: "requests",
    label: "Requests",
    href: "/requests",
    paths: ["/requests"],
  },
  {
    key: "photos",
    label: "Photos",
    href: "/photos",
    paths: ["/photos"],
  },
  // Councils, dry spills and rainfall & flow were removed (Nov 2026): the public pages show the same.
];

// Group admin items live behind the header cog, not the sidebar, each shown by task.
export const ADMIN_LINKS: NavTab[] = [
  { label: "Members", href: "/admin/users", task: "membership" },
  { label: "Group settings", href: "/admin/group", task: "comms" },
  { label: "Group settings", href: "/admin/group", task: "settings" },
];

/** The cog menu's links for these tasks, one per page. */
export function adminLinksFor(tasks: readonly string[]): NavTab[] {
  const seen = new Set<string>();
  return visibleFor(ADMIN_LINKS, tasks).filter((l) => !seen.has(l.href) && !!seen.add(l.href));
}

function matchLen(pathname: string, prefix: string): number {
  if (pathname === prefix || pathname.startsWith(prefix + "/")) return prefix.length;
  return -1;
}

/** The active section for a pathname (longest matching route prefix wins). */
export function activeSection(pathname: string): NavSection | undefined {
  let best: NavSection | undefined;
  let bestLen = -1;
  for (const s of SECTIONS) {
    for (const p of s.paths) {
      const len = matchLen(pathname, p);
      if (len > bestLen) {
        bestLen = len;
        best = s;
      }
    }
  }
  return best;
}

export function activeTabHref(pathname: string, tabs: NavTab[]): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const t of tabs) {
    const len = matchLen(pathname, t.href);
    if (len > bestLen) {
      bestLen = len;
      best = t.href;
    }
  }
  return best;
}

// --- Public "Explore → Spills" IA (regulatory restructure, REGULATORY-RESTRUCTURE-PLAN.md) ---
// Four tier-1 sections named as the questions a reader arrives with, each with tier-2 tabs. `paths`
// lists the route prefixes that belong to the section (including the old routes that now redirect in,
// so active-state resolves correctly during the transition). Longest-prefix match wins.
export const PUBLIC_SECTIONS: NavSection[] = [
  {
    key: "intro", label: "Why River Hub", icon: "", href: "/explore/spills/why-river-hub", primary: false,
    paths: ["/explore/spills/why-river-hub"],
  },
  {
    key: "now", label: "What's happening now", shortLabel: "Now", icon: "", href: "/explore/spills",
    paths: ["/explore/spills"],
    tabs: [
      { label: "Live board", href: "/explore/spills" },
      { label: "Map", href: "/explore/spills/map" },
      { label: "Emergency overflows", href: "/explore/spills/emergency-overflows" },
      { label: "Pollution incidents", href: "/explore/spills/incidents" },
    ],
  },
  {
    key: "why", label: "Why it keeps happening", shortLabel: "Why it happens", icon: "", href: "/explore/spills/why",
    paths: ["/explore/spills/why", "/explore/spills/league", "/explore/spills/works"],
    tabs: [
      { label: "Overview", href: "/explore/spills/why" },
      { label: "Dry spilling", href: "/explore/spills/why/dry" },
      { label: "Before the works", href: "/explore/spills/why/before-works" },
      { label: "Treatment works capacity", href: "/explore/spills/why/capacity" },
      { label: "Rain and river flow", href: "/explore/spills/why/rain" },
    ],
  },
  {
    key: "who", label: "Who is fixing it", shortLabel: "Who's fixing it", icon: "", href: "/explore/spills/measures",
    paths: ["/explore/spills/measures", "/explore/spills/gaps", "/explore/spills/reduction", "/explore/spills/calendar", "/explore/spills/action"],
    tabs: [
      { label: "What the regulator requires", href: "/explore/spills/measures" },
      { label: "Gaps", href: "/explore/spills/gaps" },
      { label: "Reduction tracker", href: "/explore/spills/reduction" },
      { label: "The calendar", href: "/explore/spills/calendar" },
    ],
  },
  {
    // EA lab tests banded against WFD standards, and the river above/below works (migration 0115).
    // The sampling-point pages (ea-monitoring) live here too.
    key: "health", label: "Is the river healthy?", shortLabel: "River health", icon: "", href: "/explore/health",
    paths: ["/explore/health", "/explore/ea-monitoring"],
    tabs: [
      { label: "Overview", href: "/explore/health" },
      { label: "Every sampling point", href: "/explore/ea-monitoring" },
      { label: "Volunteer testing", href: "/explore/health/volunteer" },
    ],
  },
  {
    key: "method", label: "How we know", icon: "", href: "/explore/spills/method",
    paths: ["/explore/spills/method", "/explore/spills/about"],
  },
];

// Longest-prefix section match for a public pathname. The asset detail page (/explore/spills/[id])
// falls through to "now".
export function publicActiveSection(pathname: string): NavSection | undefined {
  let best: NavSection | undefined;
  let bestLen = -1;
  for (const s of PUBLIC_SECTIONS) {
    for (const p of s.paths) {
      if ((pathname === p || pathname.startsWith(p + "/")) && p.length > bestLen) {
        best = s;
        bestLen = p.length;
      }
    }
  }
  return best;
}

// Within a section, the tab whose href is the longest matching prefix of the pathname.
export function publicActiveTabHref(pathname: string, tabs: NavTab[]): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const t of tabs) {
    if ((pathname === t.href || pathname.startsWith(t.href + "/")) && t.href.length > bestLen) {
      best = t.href;
      bestLen = t.href.length;
    }
  }
  return best;
}

// Portal pages that exist for every river, so the river switcher can open the same page on the river
// you pick. Every section and tab destination, plus section landing pages that aren't tabs.
const RIVER_AGNOSTIC_PATHS: string[] = Array.from(
  new Set([
    ...PUBLIC_SECTIONS.flatMap((s) => [s.href, ...(s.tabs ?? []).map((t) => t.href)]),
    "/explore/councils",
    "/explore/ea-monitoring",
    "/explore/spills/why-river-hub/write",
  ]),
);

/**
 * The portal path to open when switching river from `portalPath` (the path with /r/<slug> stripped).
 * A river-agnostic page is kept as-is (Dart Gaps -> Teign Gaps); a page tied to one river's records
 * (an asset, a spill event, a parish) falls back to the longest river-agnostic prefix, i.e. its
 * section or listing page. Anything else lands on the live board.
 */
export function switchRiverPath(portalPath: string): string {
  let best = "/explore/spills";
  let bestLen = -1;
  for (const p of RIVER_AGNOSTIC_PATHS) {
    if ((portalPath === p || portalPath.startsWith(p + "/")) && p.length > bestLen) {
      best = p;
      bestLen = p.length;
    }
  }
  return best;
}
