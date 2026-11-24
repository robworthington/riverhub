"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_LINKS } from "@/lib/nav-config";
import { RiverSwitcher, type MemberOrg } from "@/components/RiverSwitcher";

export function HeaderBar({
  name,
  isAdmin,
  orgs,
  moderator = null,
  onMenu,
}: {
  name: string;
  isAdmin: boolean;
  orgs: MemberOrg[];
  moderator?: { pending: number } | null;
  onMenu?: () => void;
}) {
  return (
    <header className="no-print flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button onClick={onMenu} className="rounded-md border border-gray-300 p-1.5 text-gray-600 lg:hidden" aria-label="Menu">
          ☰
        </button>
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-river-700">River Hub</span>
        </Link>
        <RiverSwitcher orgs={orgs} />
      </div>
      <div className="flex items-center gap-1">
        {(isAdmin || moderator) && <AdminMenu isAdmin={isAdmin} moderator={moderator} />}
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

function AdminMenu({ isAdmin, moderator }: { isAdmin: boolean; moderator: { pending: number } | null }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));
  const waiting = moderator?.pending ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100"
        aria-label={waiting ? `Settings & admin: ${waiting} adoption ${waiting === 1 ? "request" : "requests"} waiting` : "Settings & admin"}
        title="Settings & admin"
      >
        ⚙️
        {waiting > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {waiting}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {isAdmin && (
            <>
              <div className="px-3 py-1 text-xs uppercase text-gray-400">Admin</div>
              {ADMIN_LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {l.label}
                </Link>
              ))}
            </>
          )}
          {moderator && (
            <>
              <div className="px-3 py-1 text-xs uppercase text-gray-400">River Hub moderator</div>
              <Link href="/admin/adoptions" onClick={() => setOpen(false)} className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Adoption requests
                {waiting > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{waiting}</span>}
              </Link>
            </>
          )}
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
