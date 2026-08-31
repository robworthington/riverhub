"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_SECTIONS, publicActiveSection, publicActiveTabHref } from "@/lib/nav-config";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-rh-teal";

// Tier-1 section nav (goes in the header). A 2px bottom border — teal when active, transparent
// otherwise — so labels never shift between states.
export function PublicSectionNav() {
  const pathname = usePathname() ?? "/explore/spills";
  const section = publicActiveSection(pathname);
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px]">
      {PUBLIC_SECTIONS.map((s) => {
        const active = section?.key === s.key;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 pb-[5px] font-archivo transition-colors ${focusRing} ${
              active ? "border-rh-teal font-bold text-rh-ink" : "border-transparent font-semibold text-rh-ink3 hover:text-rh-ink"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Tier-2 sub-tab strip (full-width band below the header). Renders nothing for a section with no tabs.
export function PublicSubTabs() {
  const pathname = usePathname() ?? "/explore/spills";
  const section = publicActiveSection(pathname);
  const tabs = section?.tabs ?? [];
  if (tabs.length === 0) return null;
  const activeTab = publicActiveTabHref(pathname, tabs);
  return (
    <div className="border-b border-rh-lineSoft bg-rh-cardAlt">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-[13px]">
        {tabs.map((t) => {
          const active = activeTab === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-2 pb-[3px] ${focusRing} ${
                active ? "border-rh-teal font-semibold text-rh-ink" : "border-transparent font-medium text-rh-ink3 hover:text-rh-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
