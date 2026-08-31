// Single source of truth for the app navigation (sidebar sections + their tabs).
// Used by Sidebar, SectionTabs and active-state resolution.

export interface NavTab {
  label: string;
  href: string;
  adminOnly?: boolean;
}

export interface NavSection {
  key: string;
  label: string;
  icon: string;
  href: string; // default destination
  paths: string[]; // route prefixes that belong to this section
  cta?: boolean; // styled as the primary action
  tabs?: NavTab[];
}

export const SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    label: "Dashboards",
    icon: "🏠",
    href: "/dashboard",
    paths: ["/dashboard", "/analysis", "/map", "/heatmap"],
    tabs: [
      { label: "Overview", href: "/dashboard" },
      { label: "Analysis", href: "/analysis" },
      { label: "Site & asset map", href: "/map" },
      { label: "Pollution heat map", href: "/heatmap" },
    ],
  },
  {
    key: "water-quality",
    label: "Water quality",
    icon: "💧",
    href: "/sites",
    paths: ["/sites", "/results"],
    tabs: [
      { label: "Sites", href: "/sites" },
      { label: "Results", href: "/results" },
    ],
  },
  {
    key: "sewage",
    label: "Sewage",
    icon: "🚰",
    href: "/assets",
    paths: ["/assets", "/sewage-systems", "/dry-spills"],
    tabs: [
      { label: "Assets", href: "/assets" },
      { label: "Dry spills", href: "/dry-spills" },
      { label: "Systems", href: "/sewage-systems", adminOnly: true },
    ],
  },
  {
    key: "councils",
    label: "Councils",
    icon: "🏛️",
    href: "/councils",
    paths: ["/councils"],
  },
  {
    key: "environment",
    label: "Rainfall & flow",
    icon: "🌧️",
    href: "/environment",
    paths: ["/environment"],
  },
];

// Admin items live behind the header cog, not the sidebar.
export const ADMIN_LINKS: NavTab[] = [
  { label: "Test types", href: "/test-types" },
  { label: "Users", href: "/admin/users" },
];

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
    key: "now", label: "What's happening now", icon: "", href: "/explore/spills",
    paths: ["/explore/spills"],
    tabs: [
      { label: "Live board", href: "/explore/spills" },
      { label: "Map", href: "/explore/spills/map" },
    ],
  },
  {
    key: "why", label: "Why it keeps happening", icon: "", href: "/explore/spills/why",
    paths: ["/explore/spills/why", "/explore/spills/league", "/explore/spills/works"],
    tabs: [
      { label: "Overview", href: "/explore/spills/why" },
      { label: "Dry spilling", href: "/explore/spills/why/dry" },
      { label: "Before the works", href: "/explore/spills/why/before-works" },
      { label: "Works & capacity", href: "/explore/spills/why/capacity" },
    ],
  },
  {
    key: "who", label: "Who is fixing it", icon: "", href: "/explore/spills/measures",
    paths: ["/explore/spills/measures", "/explore/spills/gaps", "/explore/spills/calendar", "/explore/spills/action"],
    tabs: [
      { label: "Measures on record", href: "/explore/spills/measures" },
      { label: "Gaps", href: "/explore/spills/gaps" },
      { label: "The calendar", href: "/explore/spills/calendar" },
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
