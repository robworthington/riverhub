"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_SECTIONS, publicActiveSection, publicActiveTabHref } from "@/lib/nav-config";

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

// Primary section nav (design_handoff_riverhub_header §3). 3px bottom rule — navy when the section
// is active (prefix match, so sub-pages keep their section active), transparent otherwise.
export function PublicPrimaryNav() {
  const pathname = usePathname() ?? "/explore/spills";
  const section = publicActiveSection(pathname);
  return (
    <nav className="border-y border-brand-line bg-white">
      <div className={`${container} flex gap-[30px] overflow-x-auto text-[15px]`}>
        {PUBLIC_SECTIONS.map((s) => {
          const active = section?.key === s.key;
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-[3px] py-[14px] transition-colors ${focusRing} ${
                active
                  ? "border-brand-navy font-semibold text-brand-navyDeep"
                  : "border-transparent text-brand-body hover:border-brand-onNavy2 hover:text-brand-navyDeep"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Folder-style sub-tabs that sit flush on the band's bottom edge; the active tab merges into the
// white content below. Renders nothing for a section without tabs.
function BandTabs() {
  const pathname = usePathname() ?? "/explore/spills";
  const section = publicActiveSection(pathname);
  const tabs = section?.tabs ?? [];
  if (tabs.length === 0) return null;
  const activeTab = publicActiveTabHref(pathname, tabs);
  return (
    <div className="flex gap-[4px] overflow-x-auto">
      {tabs.map((t) => {
        const active = activeTab === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-t-[5px] px-4 py-[11px] text-[14px] transition-colors ${focusRing} ${
              active
                ? "-mb-px border border-brand-line2 border-b-white bg-white font-semibold text-brand-navyDeep"
                : "border border-transparent bg-brand-tabIdle font-medium text-brand-body hover:bg-brand-tabHover hover:text-brand-navyDeep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// The page-header band (design_handoff_riverhub_header §4): tinted band carrying the parent-section
// label, the page H1, an optional intro, and the folder sub-tabs. Each section page renders this at
// the very top; the section label and tabs derive from the route.
export function PageHeaderBand({ title, intro, label: labelOverride }: { title: React.ReactNode; intro?: React.ReactNode; label?: string }) {
  const pathname = usePathname() ?? "/explore/spills";
  const label = labelOverride ?? publicActiveSection(pathname)?.label;
  return (
    // full-bleed: break out of <main>'s container, and -mt-8 cancels its top padding so the band
    // sits flush under the primary nav. The inner div re-constrains to the content width.
    <div className="ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] -mt-8 border-b border-brand-line2 bg-brand-band">
      <div className={`${container} flex flex-col gap-[18px] pt-[26px]`}>
        <div className="flex max-w-[70ch] flex-col gap-[9px]">
          {label && <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">{label}</span>}
          <h1 className="font-serif text-[30px] font-bold leading-[1.12] tracking-[-0.01em] text-brand-navyDeep sm:text-[38px]">{title}</h1>
          {intro && <p className="text-[16.5px] leading-[1.6] text-brand-body [text-wrap:pretty]">{intro}</p>}
        </div>
        <BandTabs />
      </div>
    </div>
  );
}

// The page body beneath the band. <main> already provides the max-width container and horizontal
// padding, so this only adds the top gap under the band plus the page's own vertical rhythm.
export function PageBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`pt-8 ${className}`}>{children}</div>;
}
