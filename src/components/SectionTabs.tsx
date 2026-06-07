"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSection, activeTabHref } from "@/lib/nav-config";

export function SectionTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const section = activeSection(pathname);
  const tabs = (section?.tabs ?? []).filter((t) => !t.adminOnly || isAdmin);
  if (tabs.length < 2) return null; // no tab bar for single-view sections

  const activeHref = activeTabHref(pathname, tabs);

  return (
    <div className="border-b border-gray-200 bg-white px-4">
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm " +
                (on
                  ? "border-river-600 font-medium text-river-700"
                  : "border-transparent text-gray-500 hover:text-gray-800")
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
