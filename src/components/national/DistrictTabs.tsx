import Link from "next/link";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

/** Overview / Compare tabs for a river basin district page. `company` carries a ?company= filter across. */
export function DistrictTabs({ slug, active, company }: { slug: string; active: "overview" | "compare"; company?: string | null }) {
  const q = company ? `?company=${encodeURIComponent(company)}` : "";
  const tabs = [
    { key: "overview", label: "Overview", href: `/d/${slug}${q}` },
    { key: "compare", label: "Compare rivers", href: `/d/${slug}/compare${q}` },
  ] as const;
  return (
    <nav aria-label="District views" className="flex gap-[4px] border-b border-brand-line2">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px whitespace-nowrap rounded-t-[5px] px-4 py-[10px] text-[14px] transition-colors ${focusRing} ${
              on
                ? "border border-brand-line2 border-b-white bg-white font-semibold text-brand-navyDeep"
                : "border border-transparent bg-brand-tabIdle font-medium text-brand-body hover:bg-brand-tabHover hover:text-brand-navyDeep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
