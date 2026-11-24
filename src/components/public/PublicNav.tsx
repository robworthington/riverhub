"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PUBLIC_SECTIONS, publicActiveSection, publicActiveTabHref } from "@/lib/nav-config";
import { useRiverSlug, riverHref } from "@/components/public/RiverProvider";

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

// Nav config is written in terms of the portal path (/explore/…); routes live under /r/<slug>/…, so
// strip the river segment before matching active state.
function portalPathOf(pathname: string): string {
  return pathname.replace(/^\/r\/[^/]+/, "") || "/explore/spills";
}

// Primary section nav. Renders inline in the one-row header bar on wide screens ("bar") and as its
// own scrolling row beneath the bar on narrow ones ("row"). Short labels keep it on one line; the page
// band below still shows each section's full label. Sections marked primary: false ("Why River Hub")
// are left out here and linked from the footer instead. 3px bottom rule marks the active section.
export function PublicPrimaryNav({ variant = "row" }: { variant?: "bar" | "row" }) {
  const slug = useRiverSlug();
  const pathname = usePathname() ?? "/explore/spills";
  const section = publicActiveSection(portalPathOf(pathname));
  const items = PUBLIC_SECTIONS.filter((s) => s.primary !== false);
  const links = items.map((s) => {
    const active = section?.key === s.key;
    return (
      <Link
        key={s.key}
        href={riverHref(slug, s.href)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center whitespace-nowrap border-b-[3px] transition-colors ${focusRing} ${
          variant === "bar" ? "pb-[15px] pt-[18px]" : "py-[12px]"
        } ${
          active
            ? "border-brand-navy font-semibold text-brand-navyDeep"
            : "border-transparent text-brand-body hover:border-brand-onNavy2 hover:text-brand-navyDeep"
        }`}
      >
        {s.shortLabel ?? s.label}
      </Link>
    );
  });
  if (variant === "bar") {
    return (
      <nav aria-label="River sections" className="flex items-stretch gap-[26px] text-[15px]">
        {links}
      </nav>
    );
  }
  return (
    <nav aria-label="River sections" className="border-b border-brand-line bg-white">
      <div className={`${container} flex gap-[24px] overflow-x-auto text-[15px]`}>{links}</div>
    </nav>
  );
}

// Folder-style sub-tabs that sit flush on the band's bottom edge; the active tab merges into the
// white content below. Renders nothing for a section without tabs.
function BandTabs() {
  const slug = useRiverSlug();
  const pathname = usePathname() ?? "/explore/spills";
  const portalPath = portalPathOf(pathname);
  const section = publicActiveSection(portalPath);
  const tabs = section?.tabs ?? [];
  const activeTab = tabs.length ? publicActiveTabHref(portalPath, tabs) : undefined;
  // On a phone the row scrolls sideways; bring the current tab into view so it's never off-screen.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && el && (el.offsetLeft + el.offsetWidth > row.scrollLeft + row.clientWidth || el.offsetLeft < row.scrollLeft)) {
      row.scrollLeft = el.offsetLeft - 16;
    }
  }, [activeTab]);
  if (tabs.length === 0) return null;
  return (
    <div ref={rowRef} className="flex gap-[4px] overflow-x-auto">
      {tabs.map((t) => {
        const active = activeTab === t.href;
        return (
          <Link
            key={t.href}
            href={riverHref(slug, t.href)}
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
export function PageHeaderBand({
  title, intro, label: labelOverride, action,
}: {
  title: React.ReactNode; intro?: React.ReactNode; label?: string;
  /** Optional control beside the title, e.g. the page's Share button. */
  action?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/explore/spills";
  const label = labelOverride ?? publicActiveSection(portalPathOf(pathname))?.label;
  return (
    // full-bleed: break out of <main>'s container, and -mt-8 cancels its top padding so the band
    // sits flush under the primary nav. The inner div re-constrains to the content width.
    <div className="ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] -mt-8 border-b border-brand-line2 bg-brand-band">
      <div className={`${container} flex flex-col gap-[18px] pt-[26px]`}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex max-w-[70ch] flex-col gap-[9px]">
            {label && <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">{label}</span>}
            <h1 className="font-serif text-[30px] font-bold leading-[1.12] tracking-[-0.01em] text-brand-navyDeep sm:text-[38px]">{title}</h1>
            {intro && <p className="text-[16.5px] leading-[1.6] text-brand-body [text-wrap:pretty]">{intro}</p>}
          </div>
          {action && <div className="shrink-0 sm:pt-6">{action}</div>}
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
