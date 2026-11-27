"use client";

import { useState } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { Sidebar } from "@/components/Sidebar";
import { SectionTabs } from "@/components/SectionTabs";
import type { MemberOrg } from "@/components/RiverSwitcher";

export function AppShell({
  name,
  tasks,
  orgs,
  moderator = null,
  owner = false,
  children,
}: {
  name: string;
  /** The member's tasks in their current group (migration 0126): decide which tabs and links show. */
  tasks: readonly string[];
  orgs: MemberOrg[];
  /** Set for River Hub moderators: the number of adoption requests waiting. */
  moderator?: { pending: number; photoReports?: number } | null;
  /** The site owner sees the onboarding pages (migration 0131). */
  owner?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar name={name} tasks={tasks} orgs={orgs} moderator={moderator} owner={owner} onMenu={() => setOpen((o) => !o)} />
      <div className="flex flex-1">
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        {open && (
          <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
        )}
        <div className="min-w-0 flex-1">
          <SectionTabs tasks={tasks} />
          <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
