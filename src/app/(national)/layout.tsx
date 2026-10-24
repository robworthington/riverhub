import Link from "next/link";
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// National chrome (workstream D): the multi-river landing is river-agnostic, so it has its own header
// rather than the per-river public layout. Same type system as the public portal.
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-serif", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export default function NationalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} ${plexSans.variable} ${plexMono.variable} min-h-screen bg-white font-sans text-brand-text`}>
      <div className="noprint bg-brand-navy text-brand-onNavy">
        <div className={`${container} flex items-center justify-between gap-6 py-[7px] text-[12.5px]`}>
          <span className="hidden sm:inline">Open sewage &amp; water-quality data for England&rsquo;s rivers</span>
          <Link href="/login" className="ml-auto hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Log in</Link>
        </div>
      </div>

      <div className="noprint bg-white">
        <div className={`${container} flex items-center justify-between gap-8 py-[18px]`}>
          <Link href="/" className="flex items-center gap-3.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
            <span className="flex flex-col gap-[3px]">
              <span className="text-[12px] font-bold uppercase tracking-[.14em] text-brand-muted">England</span>
              <span className="font-serif text-[27px] font-bold leading-none tracking-[-0.01em] text-brand-navyDeep">River Hub</span>
            </span>
          </Link>
        </div>
      </div>

      <main className={`${container} bg-white py-8`}>{children}</main>

      <footer className="noprint mt-12 border-t border-brand-line bg-white">
        <div className={`${container} py-7 text-[13px] leading-relaxed text-brand-label`}>
          <p>
            River Hub brings together open sewage and water-quality data for rivers across England,
            maintained by local volunteer groups. Capacity and Environmental Information Regulations
            (EIR) figures are indicative estimates.
          </p>
          <p className="mt-2 text-brand-placeholder">
            Citizen-science and water-company sampling data · Environment Agency EDM returns. Not a substitute for official advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
