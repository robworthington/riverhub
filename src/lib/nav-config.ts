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
