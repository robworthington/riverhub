"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_LINKS } from "@/lib/nav-config";

export function HeaderBar({
  name,
  isAdmin,
  onMenu,
}: {
  name: string;
  isAdmin: boolean;
  onMenu?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button onClick={onMenu} className="rounded-md border border-gray-300 p-1.5 text-gray-600 lg:hidden" aria-label="Menu">
          ☰
        </button>
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-river-700">River Hub</span>
          <span className="hidden text-xs text-gray-400 sm:inline">Friends of the Dart</span>
        </Link>
      </div>
      <div className="flex items-center gap-1">
        {isAdmin && <AdminMenu />}
        <UserMenu name={name} />
      </div>
    </header>
  );
}

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  return ref;
}

function AdminMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
        aria-label="Settings & admin"
        title="Settings & admin"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-1 text-xs uppercase text-gray-400">Admin</div>
          {ADMIN_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));

  async function signOut() {
    await createClient().auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-river-100 text-xs font-semibold text-river-700">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{name}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium text-gray-800">{name}</div>
          <Link href="/profile" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            My profile
          </Link>
          <button onClick={signOut} className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
