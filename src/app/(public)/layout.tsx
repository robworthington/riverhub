import Link from "next/link";
import { INSTANCE, MARKETING_HOST } from "@/lib/instance";

const NAV = [
  { href: "/explore/map", label: "Pollution map" },
  { href: "/explore/sites", label: "Water quality" },
  { href: "/explore/spills", label: "Sewage spills" },
  { href: "/explore/improvements", label: "Improvements" },
  { href: "/explore/councils", label: "Councils" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/explore" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-river-700">{INSTANCE.portalName}</span>
            <span className="hidden text-xs text-gray-400 sm:inline">· {INSTANCE.orgName}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-gray-600 hover:text-river-700">
                {n.label}
              </Link>
            ))}
            <a href={INSTANCE.marketingUrl} className="text-gray-400 hover:text-gray-600">
              {MARKETING_HOST} ↗
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mt-10 border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-gray-500">
          <p>
            Open water-quality and sewage data for the {INSTANCE.riverName} catchment, published by{" "}
            <a href={INSTANCE.marketingUrl} className="text-river-700 hover:underline">
              {INSTANCE.orgName}
            </a>
            . Capacity and Environmental Information Regulations (EIR) figures are indicative estimates.
          </p>
          <p className="mt-2 text-gray-400">
            Citizen-science and water-company sampling data · Environment Agency EDM returns. Not a
            substitute for official advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
