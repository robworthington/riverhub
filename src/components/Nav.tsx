"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/results/new", label: "Record sample", highlight: true },
  { href: "/analysis", label: "Analysis" },
  { href: "/map", label: "Map" },
  { href: "/results", label: "Results" },
  { href: "/sites", label: "Sites" },
  { href: "/assets", label: "Assets" },
  { href: "/environment", label: "Rainfall & flow" },
];

const ADMIN_LINKS = [
  { href: "/sewage-systems", label: "Systems" },
  { href: "/test-types", label: "Test types" },
  { href: "/admin/users", label: "Users" },
];

export function Nav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-river-700">River Hub</span>
          <span className="hidden text-xs text-gray-400 sm:inline">Friends of the Dart</span>
        </div>
        <button
          className="rounded-md border border-gray-300 px-3 py-1 text-sm sm:hidden"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                ("highlight" in l && l.highlight
                  ? "btn px-3 py-1.5 "
                  : "rounded-md px-3 py-1.5 text-sm ") +
                (active(l.href) && !("highlight" in l && l.highlight)
                  ? "bg-river-50 font-medium text-river-700"
                  : !("highlight" in l && l.highlight)
                    ? "text-gray-600 hover:bg-gray-100"
                    : "")
              }
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2 text-sm text-gray-400">{name}</span>
          <button onClick={signOut} className="btn-secondary ml-1 px-3 py-1.5">
            Sign out
          </button>
        </nav>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-gray-100 px-4 py-2 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={
                "rounded-md px-3 py-2 text-sm " +
                (active(l.href) ? "bg-river-50 font-medium text-river-700" : "text-gray-700")
              }
            >
              {l.label}
            </Link>
          ))}
          <button onClick={signOut} className="btn-secondary mt-1">Sign out</button>
        </nav>
      )}
    </header>
  );
}
