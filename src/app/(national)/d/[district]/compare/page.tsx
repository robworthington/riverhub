import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MODE } from "@/lib/instance";
import { districtDetail, districtLabel, nationalRivers, type NationalRiver } from "@/lib/national-data";
import { DistrictTabs } from "@/components/national/DistrictTabs";

type Params = Promise<{ district: string }>;
type Search = Promise<{ measure?: string; company?: string }>;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

type Measure = {
  key: string;
  label: string;
  /** The value per river; null when it can't be computed (e.g. a share with no overflows). */
  value: (r: NationalRiver) => number | null;
  format: (v: number) => string;
  /** The river page that explains this measure. */
  href: string;
  note: string;
  alarm?: boolean;
  /** Rivers with fewer overflows than this aren't ranked: on a ratio, a river with 2 overflows swings
   *  from 0% to 100% on a single gap, so it would top the list on almost no evidence. */
  minOverflows?: number;
};

const MEASURES: Measure[] = [
  {
    key: "gaps", label: "Gaps", value: (r) => r.gaps, format: (v) => v.toLocaleString(),
    href: "/explore/spills/gaps", alarm: true,
    note: "Overflows with a flagged problem and no measure recorded against them.",
  },
  {
    key: "gap-share", label: "Share that are gaps",
    value: (r) => (r.overflows > 0 ? Math.round((r.gaps / r.overflows) * 100) : null),
    format: (v) => `${v}%`, href: "/explore/spills/gaps", alarm: true, minOverflows: 10,
    note: "Gaps as a share of the river's overflows, so small and large rivers can be compared. Rivers with fewer than 10 overflows aren't ranked: with so few, one gap swings the share too far.",
  },
  {
    key: "dry", label: "Dry-weather spills", value: (r) => r.dry, format: (v) => v.toLocaleString(),
    href: "/explore/spills/why/dry",
    note: "Spills with no meaningful rain on the day or the day before, since 2020.",
  },
  {
    key: "hours", label: "Spill hours, last full year", value: (r) => r.hours_lfy, format: (v) => v.toLocaleString(),
    href: "/explore/spills",
    note: "Total hours overflows spilled in the latest complete year.",
  },
  {
    key: "overflows", label: "Overflows", value: (r) => r.overflows, format: (v) => v.toLocaleString(),
    href: "/explore/spills",
    note: "Storm overflows River Hub tracks on each river.",
  },
];

function companySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { district } = await params;
  const d = MODE === "national" ? await districtDetail(district) : null;
  if (!d) return { title: "River Hub" };
  return {
    title: `Compare rivers — ${districtLabel(d.name)} — River Hub`,
    description: `The ${d.rivers} rivers River Hub covers in the ${districtLabel(d.name)}, side by side: gaps, dry-weather spills, spill hours and overflows.`,
  };
}

/** Compare the rivers in one district on a single measure, as a ranked bar list. */
export default async function DistrictComparePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  if (MODE !== "national") notFound();
  const { district } = await params;
  const { measure: measureKey, company } = await searchParams;

  const [d, allRivers] = await Promise.all([districtDetail(district), nationalRivers(district)]);
  if (!d) notFound();

  const measure = MEASURES.find((m) => m.key === measureKey) ?? MEASURES[0];
  const companies = d.companies.map((name) => ({ name, slug: companySlug(name) }));
  const activeCompany = companies.find((c) => c.slug === company) ?? null;
  const rivers = activeCompany ? allRivers.filter((r) => r.company_name === activeCompany.name) : allRivers;

  const minOverflows = measure.minOverflows ?? 0;
  const rows = rivers
    .filter((r) => r.overflows >= minOverflows)
    .map((r) => ({ r, v: measure.value(r) }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.r.river_name.localeCompare(b.r.river_name));
  const unranked = rivers
    .filter((r) => r.overflows < minOverflows)
    .sort((a, b) => a.river_name.localeCompare(b.river_name));
  const max = Math.max(0, ...rows.map((x) => x.v ?? 0));

  const qs = (m: string, c: string | null) => {
    const p = new URLSearchParams();
    if (m !== MEASURES[0].key) p.set("measure", m);
    if (c) p.set("company", c);
    const s = p.toString();
    return `/d/${d.slug}/compare${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-[13.5px] transition-colors ${focusRing} ${
      on ? "border-brand-navyDeep bg-brand-navyDeep font-semibold text-white" : "border-brand-line5 bg-white text-brand-navyDeep hover:border-brand-navy"
    }`;

  return (
    <div className="space-y-7">
      <nav aria-label="Breadcrumb" className="-mt-2 text-[13px] text-brand-body">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="text-brand-navy underline underline-offset-[3px] hover:text-brand-navyDeep">England</Link></li>
          <li aria-hidden="true" className="text-brand-placeholder">›</li>
          <li><Link href={`/d/${d.slug}`} className="text-brand-navy underline underline-offset-[3px] hover:text-brand-navyDeep">{districtLabel(d.name)}</Link></li>
          <li aria-hidden="true" className="text-brand-placeholder">›</li>
          <li aria-current="page" className="font-semibold text-brand-navyDeep">Compare rivers</li>
        </ol>
      </nav>

      <section className="space-y-3">
        <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">River basin district</span>
        <h1 className="font-serif text-[32px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-navyDeep sm:text-[40px]">
          Compare rivers in {d.name}
        </h1>
      </section>

      <DistrictTabs slug={d.slug} active="compare" company={activeCompany?.slug} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Measure">
          <span className="mr-1 text-[13.5px] text-brand-muted">Compare by</span>
          {MEASURES.map((m) => (
            <Link key={m.key} href={qs(m.key, activeCompany?.slug ?? null)} aria-current={m.key === measure.key ? "true" : undefined} className={chip(m.key === measure.key)}>
              {m.label}
            </Link>
          ))}
        </div>
        {companies.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Water company">
            <span className="mr-1 text-[13.5px] text-brand-muted">Water company</span>
            <Link href={qs(measure.key, null)} aria-current={!activeCompany ? "true" : undefined} className={chip(!activeCompany)}>All</Link>
            {companies.map((c) => (
              <Link key={c.slug} href={qs(measure.key, c.slug)} aria-current={activeCompany?.slug === c.slug ? "true" : undefined} className={chip(activeCompany?.slug === c.slug)}>
                {c.name}
              </Link>
            ))}
          </div>
        )}
        <p className="max-w-[70ch] text-[14px] leading-[1.55] text-brand-body">{measure.note}</p>
      </section>

      {rows.length === 0 && unranked.length === 0 ? (
        <p className="text-[14px] text-brand-body">River Hub doesn&rsquo;t cover any rivers in this district yet.</p>
      ) : (
        <section aria-label={`Rivers by ${measure.label.toLowerCase()}`}>
          {rows.length > 0 && (
          <ol className="divide-y divide-brand-line rounded-[6px] border border-brand-line2">
            {rows.map(({ r, v }, i) => (
              <li key={r.slug} className="grid grid-cols-[2rem_minmax(0,11rem)_minmax(0,1fr)_4.5rem] items-center gap-3 px-3 py-2.5 sm:grid-cols-[2rem_14rem_minmax(0,1fr)_5rem] sm:px-4">
                <span className="font-plexmono text-[12.5px] text-brand-label">{i + 1}</span>
                <a href={`/r/${r.slug}${measure.href}`} className="truncate text-[14px] font-semibold text-brand-navy hover:underline">
                  {r.river_name}
                </a>
                <span className="h-3 overflow-hidden rounded-full bg-brand-tabIdle" aria-hidden="true">
                  <span
                    className={`block h-full rounded-full ${measure.alarm ? "bg-brand-accent" : "bg-brand-navy"}`}
                    style={{ width: `${max > 0 && v != null ? Math.max(2, (v / max) * 100) : 0}%` }}
                  />
                </span>
                <span className={`text-right font-plexmono text-[13.5px] font-bold ${measure.alarm ? "text-rh-alarm" : "text-brand-navyDeep"}`}>
                  {v == null ? "—" : measure.format(v)}
                </span>
              </li>
            ))}
          </ol>
          )}
          {unranked.length > 0 && (
            <div className="mt-5 space-y-2">
              <h2 className="text-[13.5px] font-semibold text-brand-navyDeep">
                Not ranked: fewer than {minOverflows} overflows
              </h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-brand-body">
                {unranked.map((r) => (
                  <li key={r.slug}>
                    <a href={`/r/${r.slug}${measure.href}`} className="font-semibold text-brand-navy hover:underline">{r.river_name}</a>{" "}
                    <span className="font-plexmono text-[12.5px]">{r.gaps} of {r.overflows}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-[12.5px] text-brand-placeholder">
            Figures refresh hourly. Each river&rsquo;s page shows how its number is worked out.
          </p>
        </section>
      )}
    </div>
  );
}
