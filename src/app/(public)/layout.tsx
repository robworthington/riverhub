import Link from "next/link";
import Image from "next/image";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { INSTANCE, MARKETING_HOST } from "@/lib/instance";

// Public "Explore" redesign type system (see PUBLIC-SITE-REDESIGN.md). Scoped to the public tree
// via the font-variable classes on the wrapper, so the members side is unaffected.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

const NAV = [
  { href: "/explore/spills", label: "Live now" },
  { href: "/explore/spills/map", label: "Map" },
  { href: "/explore/spills/league", label: "League table" },
  { href: "/explore/spills/works", label: "Works & capacity" },
  { href: "/explore/spills/action", label: "Problems & action" },
  { href: "/explore/spills/about", label: "How we classify" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${archivo.variable} ${plexMono.variable} min-h-screen bg-rh-paper font-archivo text-rh-ink`}>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/explore/spills" className="flex items-center gap-2.5">
            {INSTANCE.logoUrl && (
              <Image src={INSTANCE.logoUrl} alt={INSTANCE.orgName} width={150} height={57} className="h-7 w-auto" priority />
            )}
            <span className="text-lg font-semibold text-river-700">River Hub</span>
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
            <Link
              href="/login"
              className="rounded-[3px] border border-river-700 px-3 py-1 text-sm font-semibold text-river-700 hover:bg-river-700 hover:text-white"
            >
              Log in
            </Link>
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
