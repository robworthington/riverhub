import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { publicRpc } from "@/lib/supabase/publicRpc";
import {
  BANDS, BAND_META, TEST_META, belowGood, fmt, periodLabel, siteName,
  type HealthTest, type RiverHealth, type WorksPairs,
} from "@/lib/riverHealth";

// "River health": the Environment Agency's own lab tests, banded against the Water Framework
// Directive river standards (migration 0115), plus the works the EA samples above and below.
// Cached for an hour (ISR); the EA data itself is loaded per river by the importers.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `River health — ${b.portalName}`,
    description: `Is the ${b.riverName} healthy? Environment Agency lab tests for phosphate, ammonia and dissolved oxygen at every sampling point, banded high to bad, and how the river changes above and below sewage works.`,
  };
}

function BandBar({ t }: { t: HealthTest }) {
  const parts = BANDS.map((b) => ({ b, n: t[b] })).filter((p) => p.n > 0);
  const label = BANDS.map((b) => `${t[b]} ${BAND_META[b].label.toLowerCase()}`).join(", ");
  return (
    <div role="img" aria-label={`${TEST_META[t.test].title}: ${label}`} className="flex h-[34px] overflow-hidden rounded-[6px] font-mono text-[13px] font-medium">
      {parts.map(({ b, n }) => (
        <div
          key={b}
          style={{ flexGrow: n, background: BAND_META[b].bg, color: BAND_META[b].fg }}
          className={`flex min-w-[26px] items-center ${n / t.sites > 0.08 ? "pl-2.5" : "justify-center"}`}
        >
          {n}
        </div>
      ))}
    </div>
  );
}

function verdict(tests: HealthTest[], riverName: string): React.ReactNode {
  const short = tests.filter((t) => belowGood(t) > 0).sort((a, b) => belowGood(b) / b.sites - belowGood(a) / a.sites);
  if (!short.length) return <>Yes, by the regulator&rsquo;s own tests: every sampling point on the {riverName} meets the good standard for the tests below.</>;
  const worst = short[0];
  const others = tests.filter((t) => t !== worst && belowGood(t) === 0).map((t) => TEST_META[t.test].title.toLowerCase());
  return (
    <>
      {belowGood(worst) / worst.sites > 0.3 ? "Not yet." : "Mostly."} {TEST_META[worst.test].title} is the weak spot:{" "}
      <strong className="text-rh-ink">
        {belowGood(worst)} of {worst.sites}
      </strong>{" "}
      sampling points fall short of good.
      {others.length > 0 && <> {others.join(" and ").replace(/^./, (c) => c.toUpperCase())} {others.length > 1 ? "are" : "is"} good or better everywhere.</>}
    </>
  );
}

export default async function RiverHealthPage() {
  const b = await getBranding();
  const river = await getCurrentRiver();
  const supabase = createPublicClient();
  // both RPCs return one jsonb object; publicRpc passes it through (with its retries)
  const [h, p] = river
    ? await Promise.all([
        publicRpc(supabase, "public_river_health", { p_org: river.orgId }),
        publicRpc(supabase, "public_works_wq_pairs", { p_org: river.orgId }),
      ])
    : [null, null];
  const health = (Array.isArray(h) ? null : h) as RiverHealth | null;
  const pairs = (Array.isArray(p) ? null : p) as WorksPairs | null;
  const tests = health?.determinands ?? [];
  const period = periodLabel(health?.from_year ?? null, health?.year ?? null);
  const phosphateWorst = tests.find((t) => t.test === "phosphate")?.worst ?? [];

  return (
    <>
      <PageHeaderBand
        title={`Is the ${b.riverName} healthy?`}
        intro={
          <>
            The Environment Agency tests the river in its own laboratory. Here is what those tests say, measured against
            the standards rivers are meant to meet.
          </>
        }
      />
      <PageBody className="space-y-8">
        {!tests.length ? (
          <p className="max-w-[760px] rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] leading-[1.6] text-rh-ink2">
            {health?.year ? (
              <>
                The Environment Agency hasn&rsquo;t tested any sampling point in the {b.riverName} catchment often enough
                in {period} to give a verdict: River Hub needs at least six tests at a point
                {health.points_tested ? ` (${health.points_tested} ${health.points_tested === 1 ? "point was" : "points were"} tested less often)` : ""}.
              </>
            ) : (
              <>The Environment Agency&rsquo;s test results haven&rsquo;t been loaded for the {b.riverName} yet.</>
            )}
          </p>
        ) : (
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-rh-label">
                  Environment Agency lab tests · {period} · {health?.sites} sampling points
                </p>
                <p className="max-w-[660px] text-[18px] leading-[1.5] text-rh-ink2">{verdict(tests, b.riverName)}</p>
              </div>

              {tests.map((t) => (
                <section key={t.test} aria-labelledby={`h-${t.test}`} className="space-y-3 rounded-[10px] border border-rh-line bg-rh-card px-6 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 id={`h-${t.test}`} className="text-[18px] font-semibold text-rh-ink">{TEST_META[t.test].title}</h2>
                    <span className="text-[13px] text-rh-ink3">{t.sites} sampling points · average over {period}</span>
                  </div>
                  <p className="text-[14px] leading-[1.5] text-rh-ink2">{TEST_META[t.test].blurb}</p>
                  <BandBar t={t} />
                </section>
              ))}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-rh-ink2">
                {BANDS.map((bd) => (
                  <span key={bd} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-[3px]" style={{ background: BAND_META[bd].bg }} />
                    {BAND_META[bd].label}
                  </span>
                ))}
              </div>
              <p className="max-w-[720px] text-[12.5px] leading-[1.55] text-rh-ink3">
                Bands follow the Water Framework Directive river standards, applied to each point&rsquo;s average. They are
                indicative: the Environment Agency&rsquo;s formal classification also uses percentiles and, for phosphate,
                limits set for each stretch of river. Readings below the lab&rsquo;s detection limit count at half the limit.
              </p>
            </div>

            <aside className="space-y-5">
              {phosphateWorst.length > 0 && (
                <section aria-labelledby="worst-h" className="rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
                  <h2 id="worst-h" className="mb-1 text-[16px] font-semibold text-rh-ink">Where phosphate is highest</h2>
                  <ol>
                    {phosphateWorst.map((w, i) => (
                      <li key={w.notation} className={`flex items-baseline justify-between gap-3 py-2.5 ${i ? "border-t border-rh-rowDiv" : ""}`}>
                        <RiverLink href={`/explore/ea-monitoring/${encodeURIComponent(w.notation)}`} className="text-[14px] text-rh-teal hover:underline">
                          {siteName(w.site_label)}
                        </RiverLink>
                        <span className="whitespace-nowrap font-mono text-[13px]" style={{ color: BAND_META[w.band].text }}>
                          {fmt("phosphate", w.mean)} · {BAND_META[w.band].label}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <RiverLink href="/explore/spills/map#water-quality" className="text-[14px] font-semibold text-rh-teal hover:underline">
                      See them on the map
                    </RiverLink>
                    <RiverLink href="/explore/ea-monitoring" className="text-[14px] font-semibold text-rh-teal hover:underline">
                      Every EA sampling point
                    </RiverLink>
                  </div>
                </section>
              )}
              <p className="text-[12px] leading-[1.5] text-rh-ink3">
                Source: Environment Agency Water Quality Archive, Open Government Licence. River and stream samples only.
                {!health?.clipped && " Sampling points just outside the catchment may be included."}
              </p>
            </aside>
          </div>
        )}

        {pairs && pairs.works.length > 0 && (
          <section aria-labelledby="works-h" className="space-y-4">
            <div className="space-y-1">
              <h2 id="works-h" className="font-serif text-[24px] font-bold text-brand-navyDeep">Above and below the works</h2>
              <p className="max-w-[720px] text-[15px] leading-[1.55] text-rh-ink2">
                Where the Environment Agency samples the river on both sides of a sewage works, the difference shows what the
                works adds.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pairs.works.map((w) => {
                const ph = w.tests.find((t) => t.test === "phosphate") ?? w.tests[0];
                return (
                  <RiverLink
                    key={w.key}
                    href={`/explore/health/works/${encodeURIComponent(w.key)}`}
                    className="group flex flex-col gap-2 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4 hover:border-rh-teal"
                  >
                    <span className="text-[16px] font-semibold text-rh-ink group-hover:underline">{w.name} works</span>
                    <span className="text-[13px] text-rh-ink3">{TEST_META[ph.test].title}, average {periodLabel(pairs.from_year, pairs.year)}</span>
                    <span className="font-mono text-[22px] text-rh-ink">
                      <span style={{ color: BAND_META[ph.us_band].text }}>{fmt(ph.test, ph.us_mean)}</span>
                      <span aria-label="to" className="px-2 text-rh-quiet">→</span>
                      <span style={{ color: BAND_META[ph.ds_band].text }}>{fmt(ph.test, ph.ds_mean)}</span>
                    </span>
                    <span className="text-[13px] text-rh-ink2">
                      {BAND_META[ph.us_band].label} above, {BAND_META[ph.ds_band].label.toLowerCase()} below
                    </span>
                  </RiverLink>
                );
              })}
            </div>
          </section>
        )}
      </PageBody>
    </>
  );
}
