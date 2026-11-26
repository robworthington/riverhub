"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, activeSection } from "@/lib/nav-config";

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeSection(pathname);

  return (
    <nav
      className={
        "no-print w-60 shrink-0 border-r border-brand-line bg-brand-surface p-3 lg:block " +
        (open ? "fixed inset-y-0 left-0 z-30 block pt-3 shadow-xl lg:static lg:shadow-none" : "hidden")
      }
    >
      <ul className="space-y-1">
        {SECTIONS.map((s) => {
          const isActive = active?.key === s.key;
          if (s.cta) {
            return (
              <li key={s.key}>
                <Link href={s.href} onClick={onNavigate} className="btn mt-1 w-full justify-start">
                  {s.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={
                  "flex items-center rounded-[6px] border-l-[3px] px-3 py-2 text-[14px] transition-colors " +
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy " +
                  (isActive
                    ? "border-brand-navy bg-white font-semibold text-brand-navyDeep"
                    : "border-transparent text-brand-body hover:bg-white hover:text-brand-navyDeep")
                }
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
