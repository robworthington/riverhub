import { SUPPORT_URL } from "@/lib/support";
import Link from "next/link";
import { headers } from "next/headers";
import { sourceSerif as serif, plexSans, plexMono } from "@/app/fonts";
import { INSTANCE, MODE } from "@/lib/instance";
import { RiverName } from "@/components/RiverName";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { districtHref, nationalHomeHref } from "@/lib/national";
import { coverageName, regulatorFor } from "@/lib/nation";
import { nationalRivers, riverNeighbours, type NationalRiver, type RiverNeighbour } from "@/lib/national-data";
import { RiverProvider } from "@/components/public/RiverProvider";
import { PublicPrimaryNav } from "@/components/public/PublicNav";
import { RiverSwitcher, type SwitcherRiver } from "@/components/public/RiverSwitcher";
import UmamiScript from "@/components/UmamiScript";

// Public rebrand type system (design_handoff_riverhub_header). Source Serif 4 = display, IBM Plex
// Sans = UI, IBM Plex Mono kept for the data numerals. Scoped to the public tree via the font-
// variable classes on the wrapper, so the members side is unaffected.

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const stripLink =
  "hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const navyFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

/** Every live river, for the switcher and the breadcrumb's district (national mode only). Reads the
 *  precomputed rollup via the cached RPC; a failure returns [] and just hides the switcher. */
async function liveRivers(): Promise<NationalRiver[]> {
  return MODE === "national" ? nationalRivers() : [];
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [b, river, all, h] = await Promise.all([getBranding(), getCurrentRiver(), liveRivers(), headers()]);
  const neighbours: RiverNeighbour[] = MODE === "national" ? await riverNeighbours(b.slug) : [];
  const rivers: SwitcherRiver[] = all.map((r) => ({ slug: r.slug, river_name: r.river_name, river_name_cy: r.river_name_cy ?? null, gaps: r.gaps }));
  const national = MODE === "national";
  // "England" today; "England and Wales" once a Welsh river is live (lib/nation)
  const coverage = coverageName(all.map((r) => r.nation ?? "england"));
  const nationalHref = nationalHomeHref(h.get("host"));
  const here = all.find((r) => r.slug === b.slug);
  const district =
    here?.district_slug && here.district_name
      ? {
          name: here.district_name,
          href: districtHref(nationalHref, here.district_slug),
          count: all.filter((r) => r.district_slug === here.district_slug).length,
        }
      : null;
  const spillsHome = `/r/${b.slug}/explore/spills`;
  const homeHref = nationalHref ?? spillsHome;

  // On the national site, branding comes from the river's own row only: falling back to the build-time
  // INSTANCE values would credit and badge the Friends of the Dart on every river that hasn't set its
  // own. Donations are different: they support River Hub as a whole, so Donate is the same River Hub ask
  // on every river (lib/support). Instance deployments keep the INSTANCE fallbacks.
  const logoUrl = national ? river?.logoUrl ?? null : b.logoUrl;
  const marketingUrl = national ? river?.marketingUrl ?? null : b.marketingUrl;
  const donateUrl = national ? SUPPORT_URL : b.donateUrl;
  const donateLabel = national ? "Donate to River Hub" : `Donate to ${b.orgName}`;
  // The river's own group, only when one has claimed it (steward, migration 0101).
  const hostGroup = river?.groupName ?? null;
  const marketingLabel = marketingUrl ? (hostGroup ? `Run by ${hostGroup}` : hostOf(marketingUrl)) : null;
  const showSwitcher = national && rivers.length > 1;

  // Footer publisher. Instance deployments keep their own org. On the national site it is the river's
  // own group where there is one (linked if it has a site), otherwise River Hub itself; never the
  // build-time Friends of the Dart fallback, which would credit FoD for every river.
  const linkCls = "text-brand-navy hover:underline";
  const publisher = !national ? (
    <a href={b.marketingUrl} className={linkCls}>{b.orgName}</a>
  ) : hostGroup ? (
    marketingUrl ? <a href={marketingUrl} className={linkCls}>{hostGroup}</a> : <>{hostGroup}</>
  ) : nationalHref ? (
    <a href={nationalHref} className={linkCls}>River Hub</a>
  ) : (
    <>River Hub</>
  );

  return (
    <RiverProvider slug={b.slug}>
    <div className={`${serif.variable} ${plexSans.variable} ${plexMono.variable} min-h-screen bg-white font-sans text-brand-text`}>
      <UmamiScript />
      {/* breadcrumb strip: where you are (national) or what this is (single-river instance) */}
      <div className="noprint bg-brand-navy text-brand-onNavy">
        <div className={`${container} flex min-h-[36px] items-center justify-between gap-6 py-[7px] text-[12.5px] sm:text-[13px]`}>
          {nationalHref ? (
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2">
                <li><a href={nationalHref} className={`underline underline-offset-[3px] ${stripLink}`}>{coverage}</a></li>
                <li aria-hidden="true" className="text-brand-onNavy4">›</li>
                {district?.href && (
                  <>
                    <li className="min-w-0">
                      <a href={district.href} className={`underline underline-offset-[3px] ${stripLink}`}>
                        {district.name}
                        <span className="hidden md:inline"> river basin district</span>
                      </a>
                    </li>
                    <li aria-hidden="true" className="text-brand-onNavy4">›</li>
                  </>
                )}
                <li aria-current="page" className="truncate font-semibold text-white">
                  <RiverName name={b.riverName} cy={b.riverNameCy} welshFirst={b.nation === "wales"} secondaryClassName="hidden font-normal text-brand-onNavy sm:inline" />
                </li>
              </ol>
            </nav>
          ) : (
            <span className="hidden sm:inline">Open sewage &amp; water-quality data for the {b.riverName} catchment</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-[18px] sm:gap-[22px]">
            {marketingUrl && marketingLabel && (
              <a href={marketingUrl} target="_blank" rel="noopener" className={`hidden sm:inline ${stripLink}`}>{marketingLabel} ↗</a>
            )}
            {donateUrl && (
              <a href={donateUrl} target="_blank" rel="noopener" aria-label={donateLabel} className={`font-semibold sm:hidden ${stripLink}`}>Donate</a>
            )}
            <Link href="/login" className={stripLink}>Log in</Link>
          </span>
        </div>
      </div>

      {/* one bar: wordmark (home) · river (switcher) · sections · donate */}
      <div className="noprint border-b border-brand-line bg-white">
        <div className={`${container} flex min-h-[60px] items-center gap-3 sm:gap-5`}>
          <a href={homeHref} className={`flex shrink-0 items-center gap-2.5 rounded ${navyFocus}`}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" width={34} height={34} className="hidden h-[34px] w-[34px] shrink-0 object-contain sm:block" />
            )}
            <span className="font-serif text-[20px] font-bold leading-none tracking-[-0.01em] text-brand-navyDeep sm:text-[23px]">River Hub</span>
          </a>
          <span aria-hidden="true" className="hidden h-[30px] w-px shrink-0 bg-brand-line2 sm:block" />
          {showSwitcher ? (
            <RiverSwitcher
              current={b.slug}
              currentName={b.riverName}
              currentNameCy={b.nation === "wales" ? b.riverNameCy : null}
              rivers={rivers}
              nationalHref={nationalHref}
              coverage={coverage}
              neighbours={neighbours.map((n) => ({ slug: n.slug, river_name: n.river_name, river_name_cy: all.find((r) => r.slug === n.slug)?.river_name_cy ?? null, gaps: n.gaps }))}
              district={district?.href ? { name: district.name, href: district.href, count: district.count } : null}
            />
          ) : (
            <span className="truncate text-[15px] font-semibold text-brand-navyDeep">
              <RiverName name={b.riverName} cy={b.riverNameCy} welshFirst={b.nation === "wales"} />
            </span>
          )}
          <div className="hidden flex-1 justify-center self-stretch lg:flex">
            <PublicPrimaryNav variant="bar" />
          </div>
          <div className="flex-1 lg:hidden" />
          {donateUrl && (
            <a
              href={donateUrl}
              target="_blank"
              rel="noopener"
              aria-label={donateLabel}
              title={donateLabel}
              className={`hidden shrink-0 rounded-[4px] bg-brand-accent px-[18px] py-[11px] text-[14px] font-semibold text-white transition-colors hover:bg-brand-accentHover sm:inline-block ${navyFocus}`}
            >
              Donate
            </a>
          )}
        </div>
      </div>

      {/* sections on narrow screens: their own scrolling row */}
      <div className="noprint lg:hidden">
        <PublicPrimaryNav variant="row" />
      </div>

      <main className={`${container} bg-white py-8`}>{children}</main>

      <footer className="noprint mt-12 border-t border-brand-line bg-white">
        <div className={`${container} py-7 text-[13px] leading-relaxed text-brand-label`}>
          <p>
            Open water-quality and sewage data for the {b.riverName} catchment, published by {publisher}. Capacity and
            Environmental Information Regulations (EIR) figures are indicative estimates.
          </p>
          <p className="mt-2 text-brand-placeholder">
            {national
              ? `Water company monitoring · ${regulatorFor(b.nation).name} and water company open data. Not a substitute for official advice.`
              : "Citizen-science and water-company sampling data · Environment Agency EDM returns. Not a substitute for official advice."}
          </p>
          <nav aria-label="About River Hub" className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            <Link href={`/r/${b.slug}/explore/spills/why-river-hub`} className="font-semibold text-brand-navy hover:underline">Why River Hub</Link>
            <Link href={`/r/${b.slug}/explore/spills/method`} className="font-semibold text-brand-navy hover:underline">How we know</Link>
            {nationalHref && <a href={nationalHref} className="font-semibold text-brand-navy hover:underline">All rivers in {coverage}</a>}
          </nav>
          <p className="mt-2 text-brand-placeholder">
            Built by{" "}
            <a href="https://www.linkedin.com/in/rworthington2/" target="_blank" rel="noopener" className="text-brand-navy hover:underline">Rob Worthington</a>{" "}
            and{" "}
            <a href="https://www.linkedin.com/in/harry-harbour-905616431/" target="_blank" rel="noopener" className="text-brand-navy hover:underline">Harry Harbour</a>, volunteers at{" "}
            {/* Who built River Hub: the same on every river, so not the current river's org. */}
            <a href="https://www.friendsofthedart.org" target="_blank" rel="noopener" className="text-brand-navy hover:underline">Friends of the Dart</a>, building on the pioneering sewage-spill analysis of Peter Hammond.
          </p>
        </div>
      </footer>
    </div>
    </RiverProvider>
  );
}
