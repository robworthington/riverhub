"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSection, activeTabHref, visibleFor } from "@/lib/nav-config";

export function SectionTabs({ tasks }: { tasks: readonly string[] }) {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const tabs = visibleFor(section?.tabs ?? [], tasks);
  if (tabs.length < 2) return null; // no tab bar for single-view sections

  const activeHref = activeTabHref(pathname, tabs);

  return (
    <div className="no-print border-b border-brand-line2 bg-brand-band px-5 pt-3 sm:px-8">
      <nav aria-label="Section" className="mx-auto flex max-w-5xl gap-[4px] overflow-x-auto">
        {tabs.map((t) => {
          const on = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={
                "whitespace-nowrap rounded-t-[5px] px-4 py-[10px] text-[14px] transition-colors " +
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy " +
                (on
                  ? "-mb-px border border-brand-line2 border-b-white bg-white font-semibold text-brand-navyDeep"
                  : "border border-transparent bg-brand-tabIdle font-medium text-brand-body hover:bg-brand-tabHover hover:text-brand-navyDeep")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
