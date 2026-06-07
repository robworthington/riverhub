"use client";

import { useState } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { Sidebar } from "@/components/Sidebar";
import { SectionTabs } from "@/components/SectionTabs";

export function AppShell({
  name,
  isAdmin,
  children,
}: {
  name: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar name={name} isAdmin={isAdmin} onMenu={() => setOpen((o) => !o)} />
      <div className="flex flex-1">
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        {open && (
          <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
        )}
        <div className="min-w-0 flex-1">
          <SectionTabs isAdmin={isAdmin} />
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
