import Link from "next/link";
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { INSTANCE, MARKETING_HOST } from "@/lib/instance";
import { PublicPrimaryNav } from "@/components/public/PublicNav";

// Public rebrand type system (design_handoff_riverhub_header). Source Serif 4 = display, IBM Plex
// Sans = UI, IBM Plex Mono kept for the data numerals. Scoped to the public tree via the font-
// variable classes on the wrapper, so the members side is unaffected.
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-serif", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} ${plexSans.variable} ${plexMono.variable} min-h-screen bg-white font-sans text-brand-text`}>
      {/* utility strip */}
      <div className="noprint bg-brand-navy text-brand-onNavy">
        <div className={`${container} flex items-center justify-between gap-6 py-[7px] text-[12.5px]`}>
          <span className="hidden sm:inline">Open sewage &amp; water-quality data for the {INSTANCE.riverName} catchment</span>
          <span className="ml-auto flex items-center gap-[22px]">
            <a href={INSTANCE.marketingUrl} target="_blank" rel="noopener" className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{MARKETING_HOST} ↗</a>
            <Link href="/login" className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Log in</Link>
          </span>
        </div>
      </div>

      {/* brand row */}
      <div className="noprint bg-white">
        <div className={`${container} flex items-center justify-between gap-8 py-[18px]`}>
          <Link href="/explore/spills" className="flex items-center gap-3.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fod-mark.png" alt={INSTANCE.orgName} width={46} height={46} className="h-[46px] w-[46px] shrink-0" />
            <span className="flex flex-col gap-[3px]">
              <span className="text-[12px] font-bold uppercase tracking-[.14em] text-brand-muted">{INSTANCE.orgName}</span>
              <span className="font-serif text-[27px] font-bold leading-none tracking-[-0.01em] text-brand-navyDeep">River Hub</span>
            </span>
          </Link>
          <a
            href={INSTANCE.donateUrl}
            target="_blank"
            rel="noopener"
            className="shrink-0 rounded-[4px] bg-brand-accent px-[22px] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-accentHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            Donate
          </a>
        </div>
      </div>

      {/* primary nav */}
      <div className="noprint">
        <PublicPrimaryNav />
      </div>

      <main className={`${container} bg-white py-8`}>{children}</main>

      <footer className="noprint mt-12 border-t border-brand-line bg-white">
        <div className={`${container} py-7 text-[13px] leading-relaxed text-brand-label`}>
          <p>
            Open water-quality and sewage data for the {INSTANCE.riverName} catchment, published by{" "}
            <a href={INSTANCE.marketingUrl} className="text-brand-navy hover:underline">{INSTANCE.orgName}</a>. Capacity and
            Environmental Information Regulations (EIR) figures are indicative estimates.
          </p>
          <p className="mt-2 text-brand-placeholder">
            Citizen-science and water-company sampling data · Environment Agency EDM returns. Not a substitute for official advice.
          </p>
          <p className="mt-2 text-brand-placeholder">
            Built by Rob Worthington and Harry Harbour, volunteers at {INSTANCE.orgName}, building on the pioneering sewage-spill analysis of Peter Hammond.
          </p>
        </div>
      </footer>
    </div>
  );
}
