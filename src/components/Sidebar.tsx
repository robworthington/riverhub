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
        "no-print w-60 shrink-0 border-r border-gray-200 bg-white p-3 lg:block " +
        (open ? "fixed inset-y-0 left-0 z-30 block pt-3 shadow-xl lg:static lg:shadow-none" : "hidden")
      }
    >
      <ul className="space-y-1">
        {SECTIONS.map((s) => {
          const isActive = active?.key === s.key;
          if (s.cta) {
            return (
              <li key={s.key}>
                <Link href={s.href} onClick={onNavigate} className="btn mt-1 w-full justify-start gap-2">
                  <span>{s.icon}</span> {s.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                onClick={onNavigate}
                className={
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm " +
                  (isActive ? "bg-river-50 font-medium text-river-700" : "text-gray-700 hover:bg-gray-100")
                }
              >
                <span className="w-5 text-center">{s.icon}</span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
