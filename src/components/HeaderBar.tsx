"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminLinksFor, type NavTab } from "@/lib/nav-config";
import { RiverSwitcher, type MemberOrg } from "@/components/RiverSwitcher";

export function HeaderBar({
  name,
  tasks,
  orgs,
  moderator = null,
  owner = false,
  onMenu,
}: {
  name: string;
  tasks: readonly string[];
  orgs: MemberOrg[];
  moderator?: { pending: number; photoReports?: number } | null;
  owner?: boolean;
  onMenu?: () => void;
}) {
  // Same chrome as the public site: a navy strip saying where you are, then the white bar with the
  // serif wordmark and the river switcher.
  return (
    <header className="no-print">
      <div className="bg-brand-navy text-brand-onNavy">
        <div className="flex min-h-[34px] items-center justify-between gap-4 px-4 py-[6px] text-[12.5px] sm:px-6 sm:text-[13px]">
          <span className="font-semibold tracking-[.02em]">Members&rsquo; area</span>
          <a href="/" className={`underline underline-offset-[3px] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy`}>Public site</a>
        </div>
      </div>
      <div className="border-b border-brand-line bg-white">
        <div className="flex min-h-[58px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <button onClick={onMenu} className={`rounded-[6px] border border-brand-line5 p-2 text-brand-navy lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy`} aria-label="Menu">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link href="/dashboard" className={`shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy`}>
            <span className="whitespace-nowrap font-serif text-[18px] font-bold leading-none tracking-[-0.01em] text-brand-navyDeep sm:text-[22px]">River Hub</span>
          </Link>
          <span aria-hidden="true" className="hidden h-[28px] w-px shrink-0 bg-brand-line2 sm:block" />
          <RiverSwitcher orgs={orgs} />
          <div className="flex-1" />
          {(adminLinksFor(tasks).length > 0 || moderator || owner) && <AdminMenu links={adminLinksFor(tasks)} moderator={moderator} owner={owner} />}
          <UserMenu name={name} />
        </div>
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

function AdminMenu({ links, moderator, owner }: { links: NavTab[]; moderator: { pending: number; photoReports?: number } | null; owner: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));
  const waiting = (moderator?.pending ?? 0) + (moderator?.photoReports ?? 0);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-[6px] p-2 text-brand-body hover:bg-brand-surface hover:text-brand-navyDeep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
        aria-label={waiting ? `Settings & admin: ${waiting} ${waiting === 1 ? "item" : "items"} waiting for review` : "Settings & admin"}
        title="Settings & admin"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
        {waiting > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rh-alarm px-1 text-[10px] font-bold text-white">
            {waiting}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-[8px] border border-brand-line2 bg-white py-1 shadow-lg">
          {links.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-brand-label">Group</div>
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">
                  {l.label}
                </Link>
              ))}
            </>
          )}
          {owner && (
            <>
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-brand-label">River Hub owner</div>
              <Link href="/platform/rivers" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">Rivers</Link>
              <Link href="/platform/groups" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">Groups</Link>
            </>
          )}
          {moderator && (
            <>
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-brand-label">River Hub moderator</div>
              <Link href="/admin/adoptions" onClick={() => setOpen(false)} className="flex items-center justify-between px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">
                Adoption requests
                {(moderator.pending ?? 0) > 0 && <span className="rounded-full bg-rh-alarm px-1.5 text-[11px] font-bold text-white">{moderator.pending}</span>}
              </Link>
              <Link href="/admin/photo-reports" onClick={() => setOpen(false)} className="flex items-center justify-between px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">
                Photo reports
                {(moderator.photoReports ?? 0) > 0 && <span className="rounded-full bg-rh-alarm px-1.5 text-[11px] font-bold text-white">{moderator.photoReports}</span>}
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
        className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-brand-text hover:bg-brand-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{name}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-brand-label"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border border-brand-line2 bg-white py-1 shadow-lg">
          <div className="border-b border-brand-line3 px-3 py-2 text-sm font-semibold text-brand-navyDeep">{name}</div>
          <Link href="/profile" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-brand-text hover:bg-brand-surface">
            My profile
          </Link>
          <button onClick={signOut} className="block w-full border-t border-brand-line3 px-3 py-2 text-left text-sm text-brand-text hover:bg-brand-surface">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
