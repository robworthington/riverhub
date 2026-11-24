import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MODE } from "@/lib/instance";
import {
  districtDetail,
  districtLabel,
  nationalDistricts,
  nationalRivers,
  incidentTotals,
  sumIncidents,
  type NationalRiver,
} from "@/lib/national-data";
import { DistrictMap } from "@/components/national/DistrictMap";
import { DistrictTabs } from "@/components/national/DistrictTabs";

type Params = Promise<{ district: string }>;
type Search = Promise<{ company?: string }>;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { district } = await params;
  const d = MODE === "national" ? await districtDetail(district) : null;
  if (!d) return { title: "River Hub" };
  return {
    title: `${districtLabel(d.name)} — River Hub`,
    description: `Open sewage and water-quality data for the ${d.rivers} rivers River Hub covers in the ${districtLabel(d.name)}: overflows, the gaps in the public record, and dry-weather spills.`,
  };
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-[6px] border border-brand-line2 bg-white px-5 py-4">
      <div className={`font-plexmono text-[30px] font-bold leading-none ${accent ? "text-rh-alarm" : "text-brand-navyDeep"}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1.5 text-[13px] text-brand-body">{label}</div>
    </div>
  );
}

function companySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * River basin district page (/d/<slug>): totals, map and league for the rivers River Hub covers in
 * one EA district, optionally narrowed to one water company (?company=<slug>).
 */
export default async function DistrictPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  if (MODE !== "national") notFound();
  const { district } = await params;
  const { company } = await searchParams;

  const [d, allRivers, districts, incRows] = await Promise.all([
    districtDetail(district),
    nationalRivers(district),
    nationalDistricts(),
    incidentTotals(district),
  ]);
  if (!d) notFound();

  const companies = d.companies.map((name) => ({
    name,
    slug: companySlug(name),
    count: allRivers.filter((r) => r.company_name === name).length,
  }));
  const activeCompany = companies.find((c) => c.slug === company) ?? null;
  const rivers: NationalRiver[] = activeCompany
    ? allRivers.filter((r) => r.company_name === activeCompany.name)
    : allRivers;

  const totals = rivers.reduce(
    (t, r) => ({ overflows: t.overflows + r.overflows, gaps: t.gaps + r.gaps, dry: t.dry + r.dry }),
    { overflows: 0, gaps: 0, dry: 0 },
  );
  // serious sewage pollution incidents (migration 0106), for the rivers in view
  const incBySlug = new Map(incRows.map((r) => [r.slug, r]));
  const inc = sumIncidents(rivers.map((r) => incBySlug.get(r.slug)).filter((r): r is NonNullable<typeof r> => Boolean(r)));
  const mapRivers = rivers
    .filter((r): r is NationalRiver & { lat: number; lng: number } => r.lat != null && r.lng != null)
    .map((r) => ({ slug: r.slug, name: r.river_name, lat: r.lat, lng: r.lng, gaps: r.gaps, overflows: r.overflows }));
  const reductionPct =
    !activeCompany && d.baseline_spills > 0
      ? Math.round(((d.baseline_spills - d.latest_spills) / d.baseline_spills) * 100)
      : null;
  const others = districts.filter((x) => x.slug !== d.slug);
  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3.5 text-[13.5px] transition-colors ${focusRing} ${
      active
        ? "border-brand-navyDeep bg-brand-navyDeep font-semibold text-white"
        : "border-brand-line5 bg-white text-brand-navyDeep hover:border-brand-navy"
    }`;

  return (
    <div className="space-y-9">
      <nav aria-label="Breadcrumb" className="-mt-2 text-[13px] text-brand-body">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="text-brand-navy underline underline-offset-[3px] hover:text-brand-navyDeep">England</Link></li>
          <li aria-hidden="true" className="text-brand-placeholder">›</li>
          <li aria-current="page" className="font-semibold text-brand-navyDeep">{districtLabel(d.name)}</li>
        </ol>
      </nav>

      <section className="space-y-4">
        <div className="max-w-[68ch] space-y-3">
          <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">River basin district</span>
          <h1 className="font-serif text-[34px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-navyDeep sm:text-[42px]">{d.name}</h1>
          <p className="text-[16.5px] leading-[1.6] text-brand-body">
            One of the river basin districts the Environment Agency plans and reports river health by.{" "}
            {d.rivers > 0
              ? <>River Hub covers {d.rivers} {d.rivers === 1 ? "river" : "rivers"} here.</>
              : <>River Hub doesn&rsquo;t cover any of its rivers yet.</>}
          </p>
        </div>
        {companies.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by water company">
            <span className="mr-1 text-[13.5px] text-brand-muted">Water company</span>
            <Link href={`/d/${d.slug}`} aria-current={!activeCompany ? "true" : undefined} className={chip(!activeCompany)}>
              All · {allRivers.length}
            </Link>
            {companies.map((c) => (
              <Link
                key={c.slug}
                href={`/d/${d.slug}?company=${c.slug}`}
                aria-current={activeCompany?.slug === c.slug ? "true" : undefined}
                className={chip(activeCompany?.slug === c.slug)}
              >
                {c.name} · {c.count}
              </Link>
            ))}
          </div>
        )}
        {companies.length === 1 && (
          <p className="text-[13.5px] text-brand-body">Water company: <strong className="text-brand-navyDeep">{companies[0].name}</strong></p>
        )}
      </section>

      {d.rivers > 0 && <DistrictTabs slug={d.slug} active="overview" company={activeCompany?.slug} />}

      {rivers.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Totals">
            <Stat value={rivers.length} label={rivers.length === 1 ? "river covered" : "rivers covered"} />
            <Stat value={totals.overflows} label="overflows tracked" />
            <Stat value={totals.gaps} label="gaps: flagged, no measure on record" accent />
            <Stat value={totals.dry} label="dry-weather spills since 2020" />
            {incRows.length > 0 && (
              <Stat value={inc.incidents} label={`serious pollution incidents${inc.firstYear ? ` since ${inc.firstYear}` : ""} (EA)`} />
            )}
          </section>

          <section className="flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-[1_1_420px] space-y-2.5">
              <h2 className="font-serif text-[22px] font-bold text-brand-navyDeep">Rivers by gaps</h2>
              <DistrictMap boundary={d.boundary} rivers={mapRivers} />
              <p className="text-[12.5px] text-brand-placeholder">
                Bigger dots have more gaps. District outline: Environment Agency WFD operational catchments, simplified.
              </p>
            </div>
            <div className="min-w-0 flex-[1_1_440px] space-y-2.5">
              <h2 className="font-serif text-[22px] font-bold text-brand-navyDeep">Where the gaps are widest</h2>
              <div className="overflow-x-auto rounded-[6px] border border-brand-line2">
                <table className="w-full text-[14px]">
                  <thead className="bg-brand-band text-left text-[12px] uppercase tracking-[.08em] text-brand-label">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">River</th>
                      {companies.length > 1 && !activeCompany && <th scope="col" className="px-4 py-2.5 font-semibold">Company</th>}
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Gaps</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Overflows</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Dry spills</th>
                      {incRows.length > 0 && <th scope="col" className="px-4 py-2.5 text-right font-semibold">Incidents</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rivers.map((r) => (
                      <tr key={r.slug} className="border-t border-brand-line">
                        <td className="px-4 py-2.5">
                          <a href={`/r/${r.slug}/explore/spills/gaps`} className="font-semibold text-brand-navy hover:underline">{r.river_name}</a>
                        </td>
                        {companies.length > 1 && !activeCompany && <td className="px-4 py-2.5 text-[13px] text-brand-body">{r.company_name}</td>}
                        <td className="px-4 py-2.5 text-right font-plexmono font-bold text-rh-alarm">{r.gaps}</td>
                        <td className="px-4 py-2.5 text-right font-plexmono text-brand-body">{r.overflows}</td>
                        <td className="px-4 py-2.5 text-right font-plexmono text-brand-body">{r.dry.toLocaleString()}</td>
                        {incRows.length > 0 && <td className="px-4 py-2.5 text-right font-plexmono">
                          {(incBySlug.get(r.slug)?.incidents ?? 0) > 0 ? (
                            <a href={`/r/${r.slug}/explore/spills/incidents`} className="text-brand-navy hover:underline">{incBySlug.get(r.slug)?.incidents}</a>
                          ) : (
                            <span className="text-brand-placeholder">0</span>
                          )}
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {reductionPct != null && (
            <section className="rounded-[6px] border border-brand-line2 bg-brand-band px-6 py-6">
              <h2 className="font-serif text-[22px] font-bold text-brand-navyDeep">Progress against the 2020 baseline</h2>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-plexmono text-[38px] font-bold leading-none text-brand-navyDeep">
                  {reductionPct > 0 ? "−" : "+"}{Math.abs(reductionPct)}%
                </span>
                <span className="text-[14px] text-brand-body">
                  counted spills across the covered rivers in this district, latest full year vs the 2020 baseline
                  ({d.baseline_spills.toLocaleString()} → {d.latest_spills.toLocaleString()})
                </span>
              </div>
              <p className="mt-2 max-w-[70ch] text-[12.5px] text-brand-placeholder">
                Counted on the Environment Agency 12/24-hour basis. Covers only the rivers River Hub tracks here.
              </p>
            </section>
          )}
        </>
      )}

      {others.length > 0 && (
        <section className="space-y-3 border-t border-brand-line2 pt-6">
          <h2 className="font-serif text-[20px] font-bold text-brand-navyDeep">Other river basin districts</h2>
          <ul className="flex flex-wrap gap-2 text-[13.5px]">
            {others.map((o) =>
              o.rivers > 0 ? (
                <li key={o.slug}>
                  <Link href={`/d/${o.slug}`} className={`inline-flex h-9 items-center rounded-full border border-brand-line5 px-3.5 text-brand-navyDeep hover:border-brand-navy ${focusRing}`}>
                    {o.name} · {o.rivers}
                  </Link>
                </li>
              ) : (
                <li key={o.slug} className="inline-flex h-9 items-center rounded-full border border-dashed border-brand-dashed px-3.5 text-brand-label">
                  {o.name} · not yet covered
                </li>
              ),
            )}
          </ul>
          <p className="text-[13.5px] text-brand-body">
            Run a river group in one of these?{" "}
            <a href="mailto:hello@riverhub.org?subject=River%20Hub%20—%20cover%20my%20river" className="text-brand-navy hover:underline">Register interest →</a>
          </p>
        </section>
      )}
    </div>
  );
}
