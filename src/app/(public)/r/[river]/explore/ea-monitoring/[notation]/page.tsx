import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentRiver, getBranding } from "@/lib/river-context";
import { RiverLink } from "@/components/public/RiverLink";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { TimeSeriesChart, type ChartPoint } from "@/components/TimeSeriesChart";
import { EaDeterminandSelect } from "@/components/EaDeterminandSelect";
import { WqChart, BandKey, type WqReading } from "@/components/public/WqChart";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { fetchPointSamples } from "@/lib/wqSamples";
import {
  BAND_META, TEST_DETERMINAND, TEST_META, fmt, periodLabel, siteName,
  type Band, type TestKey, type WorksPairs, type WqPoint, type WqPointTest, type WqSample,
} from "@/lib/riverHealth";

// One EA sampling point (design option D): the graded tests charted on the river-standard bands, a
// plain-English summary, and every other reading below. Linked from the River health page, the map's
// water-quality layer and the EA monitoring list. Data: migration 0117.
export const revalidate = 3600;

type Range = "1y" | "3y" | "all";
const RANGES: { key: Range; label: string; years: number | null }[] = [
  { key: "1y", label: "1 year", years: 1 },
  { key: "3y", label: "3 years", years: 3 },
  { key: "all", label: "All", years: null },
];
const GRADED: TestKey[] = ["phosphate", "ammonia", "oxygen"];
const TEMPERATURE = "Temperature of Water";

async function loadPoint(orgId: string, notation: string): Promise<WqPoint | null> {
  const d = await publicRpc(createPublicClient(), "public_wq_point", { p_org: orgId, p_notation: notation });
  return (d && !Array.isArray(d) ? d : null) as WqPoint | null;
}

export async function generateMetadata({ params }: { params: Promise<{ notation: string }> }): Promise<Metadata> {
  const { notation } = await params;
  const b = await getBranding();
  const river = await getCurrentRiver();
  const pt = river ? await loadPoint(river.orgId, decodeURIComponent(notation)) : null;
  const name = pt ? siteName(pt.site_label) : decodeURIComponent(notation);
  return {
    title: `${name}: EA water tests — ${b.portalName}`,
    description: `Environment Agency lab tests at ${name} on the ${b.riverName}: phosphate, ammonia and dissolved oxygen over time against the river standards, and every other reading.`,
  };
}

/** A reading's value as River Hub averages it: below-detection readings count at half the limit. */
function value(s: WqSample): number | null {
  if (s.result == null) return null;
  return s.result_qualifier === "<" ? Number(s.result) / 2 : Number(s.result);
}

function summary(tests: WqPointTest[]): string {
  const banded = tests.filter((t) => t.band);
  if (!banded.length) return "";
  const short = banded.filter((t) => ["moderate", "poor", "bad"].includes(t.band as Band));
  const ok = banded.filter((t) => !short.includes(t));
  const parts = short.map((t) => `${TEST_META[t.test].title} averages ${BAND_META[t.band as Band].label.toLowerCase()}, below the good standard.`);
  if (ok.length) {
    const names = ok.map((t) => TEST_META[t.test].title.toLowerCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    const allHigh = ok.every((t) => t.band === "high");
    parts.push(`${list.replace(/^./, (c) => c.toUpperCase())} ${ok.length > 1 ? "are" : "is"} ${allHigh ? "high" : "good or better"}.`);
  }
  return parts.join(" ");
}

export default async function EaSitePage({
  params, searchParams,
}: {
  params: Promise<{ notation: string }>;
  searchParams: Promise<{ d?: string; range?: string }>;
}) {
  const { notation } = await params;
  const note = decodeURIComponent(notation);
  const sp = await searchParams;
  const range: Range = sp.range === "1y" || sp.range === "all" ? sp.range : "3y";
  const supabase = createPublicClient();
  const b = await getBranding();
  const river = await getCurrentRiver();
  if (!river) notFound();

  const [pt, fetched] = await Promise.all([loadPoint(river.orgId, note), fetchPointSamples(supabase, river.orgId, note)]);
  const samples = fetched ?? [];
  if (!pt && samples.length === 0) notFound();

  // a works page exists only where the EA samples both sides of the works (public_works_wq_pairs)
  let worksHref: string | null = null;
  if (pt?.works_key) {
    const d = await publicRpc(supabase, "public_works_wq_pairs", { p_org: river.orgId });
    const pairs = (d && !Array.isArray(d) ? d : null) as WorksPairs | null;
    if (pairs?.works.some((w) => w.key === pt.works_key)) {
      worksHref = `/explore/health/works/${encodeURIComponent(pt.works_key)}`;
    }
  }

  const label = pt ? siteName(pt.site_label) : note;
  const times = samples.map((s) => Date.parse(s.sampled_at));
  const latestMs = times.length ? Math.max(...times) : Date.now();
  const years = RANGES.find((r) => r.key === range)!.years;
  const fromMs = years ? Date.UTC(new Date(latestMs).getUTCFullYear() - years + 1, 0, 1) : Math.min(...times, latestMs);
  const toMs = Date.UTC(new Date(latestMs).getUTCFullYear() + 1, 0, 1);
  const inRange = samples.filter((s) => Date.parse(s.sampled_at) >= fromMs);
  const visits = new Set(inRange.map((s) => s.sampled_at.slice(0, 10))).size;
  const firstYear = new Date(fromMs).getUTCFullYear();
  const lastYear = new Date(latestMs).getUTCFullYear();
  const rangeText = firstYear === lastYear ? `in ${lastYear}` : `from ${firstYear} to ${lastYear}`;
  const rangeYears = firstYear === lastYear ? String(lastYear) : `${firstYear}–${lastYear}`;

  const series = (determinand: string) =>
    inRange
      .filter((s) => s.determinand === determinand && value(s) != null)
      .map((s) => ({ t: Date.parse(s.sampled_at), v: value(s)!, below: s.result_qualifier === "<", raw: Number(s.result) }));
  const cards = GRADED.map((k) => ({ k, rows: series(TEST_DETERMINAND[k]), test: pt?.tests.find((t) => t.test === k) }))
    .filter((c) => c.rows.length > 0);
  const temp = series(TEMPERATURE);

  // every other test, for the full-readings section
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.determinand, (counts.get(s.determinand) ?? 0) + 1);
  const determinands = [...counts.entries()].map(([name, n]) => ({ name, n })).sort((a, c) => c.n - a.n);
  const selected = sp.d && counts.has(sp.d) ? sp.d : determinands[0]?.name ?? "";
  const forDet = samples.filter((s) => s.determinand === selected);
  const unit = forDet.find((s) => s.unit)?.unit ?? "";
  const points: ChartPoint[] = forDet
    .filter((s) => s.result != null)
    .map((s) => ({ t: Date.parse(s.sampled_at), value: Number(s.result), label: s.sampled_at.slice(0, 16).replace("T", " ") }))
    .sort((a, c) => a.t - c.t);
  const rows = forDet.slice().sort((a, c) => c.sampled_at.localeCompare(a.sampled_at));
  const period = periodLabel(pt?.from_year ?? null, pt?.year ?? null);
  const csvHref = `/api/public/wq-samples?river=${encodeURIComponent(river.slug)}&point=${encodeURIComponent(note)}`;
  const rangeHref = (r: Range) => `/explore/ea-monitoring/${encodeURIComponent(note)}${r === "3y" ? "" : `?range=${r}`}`;
  const btn = "flex min-h-[44px] items-center rounded-[6px] border border-rh-line bg-white px-4 text-[14px] font-semibold text-brand-navy hover:border-rh-teal";

  return (
    <>
      <PageHeaderBand
        label="EA sampling point"
        title={label}
        intro={
          <>
            Sampled by the Environment Agency on {visits} {visits === 1 ? "visit" : "visits"} {rangeText}.{" "}
            {pt && summary(pt.tests)}
            {pt && pt.tests.some((t) => t.band) && period ? ` Averages are over ${period}.` : ""}
          </>
        }
      />
      <PageBody className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RiverLink href="/explore/ea-monitoring" className="text-[14px] text-rh-teal hover:underline">← All EA sampling points</RiverLink>
          <nav aria-label="Time range" className="flex gap-2">
            {RANGES.map((r) => (
              <RiverLink
                key={r.key}
                href={rangeHref(r.key)}
                aria-current={r.key === range ? "page" : undefined}
                className={`flex min-h-[44px] items-center rounded-[6px] border px-3.5 text-[14px] ${r.key === range ? "border-brand-navy bg-brand-navy font-semibold text-white" : "border-rh-line bg-white text-rh-ink2 hover:border-rh-teal"}`}
              >
                {r.label}
              </RiverLink>
            ))}
          </nav>
        </div>

        {cards.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map(({ k, rows: rr, test }) => {
              const vs = rr.map((r) => r.v);
              const avg = vs.reduce((a, v) => a + v, 0) / vs.length;
              const edge = TEST_META[k].lowerIsBetter ? Math.max(...vs) : Math.min(...vs);
              const readings: WqReading[] = rr.map((r) => ({ t: r.t, v: r.below ? r.raw : r.v, below: r.below }));
              return (
                <section key={k} aria-labelledby={`t-${k}`} className="space-y-2.5 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 id={`t-${k}`} className="text-[16px] font-semibold text-rh-ink">{TEST_META[k].title}</h2>
                    <span className="font-plexmono text-[12.5px] text-rh-ink2">
                      {rangeYears}: avg {fmt(k, avg)} · {TEST_META[k].lowerIsBetter ? "max" : "min"} {fmt(k, edge)} {TEST_META[k].unit}
                    </span>
                  </div>
                  {test?.band && (
                    <p className="text-[13px] text-rh-ink2">
                      Band, {period} average:{" "}
                      <strong style={{ color: BAND_META[test.band].text }}>{fmt(k, test.mean)} · {BAND_META[test.band].label}</strong>
                    </p>
                  )}
                  <WqChart
                    readings={readings} test={k} unit={TEST_META[k].unit} from={fromMs} to={toMs}
                    label={`${TEST_META[k].title} readings at ${label}: ${rr.length} tests, average ${fmt(k, avg)} ${TEST_META[k].unit}, shaded by river-standard band`}
                  />
                  <div className="text-[11.5px] text-rh-ink3"><BandKey test={k} /></div>
                </section>
              );
            })}
            {temp.length > 0 && (
              <section aria-labelledby="t-temp" className="space-y-2.5 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 id="t-temp" className="text-[16px] font-semibold text-rh-ink">Water temperature</h2>
                  <span className="font-plexmono text-[12.5px] text-rh-ink2">
                    {Math.min(...temp.map((r) => r.v)).toFixed(1)}–{Math.max(...temp.map((r) => r.v)).toFixed(1)} °C
                  </span>
                </div>
                <p className="text-[13px] text-rh-ink2">Warm water holds less oxygen. There is no river standard for temperature here.</p>
                <WqChart
                  readings={temp.map((r) => ({ t: r.t, v: r.v, below: false }))} test={null} unit="°C" from={fromMs} to={toMs}
                  label={`Water temperature readings at ${label}: ${temp.length} tests`}
                />
              </section>
            )}
          </div>
        ) : (
          <p className="max-w-[760px] rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] leading-[1.6] text-rh-ink2">
            No phosphate, ammonia or dissolved-oxygen tests here in this period. Every other reading is below.
          </p>
        )}

        <p className="max-w-[760px] text-[12.5px] leading-[1.55] text-rh-ink3">
          Shading shows the Water Framework Directive river standards. Hollow dots are readings below the lab&rsquo;s
          detection limit, drawn at the limit; averages count them at half the limit. Bands are indicative: the
          Environment Agency&rsquo;s formal classification also uses percentiles and, for phosphate, limits set for each
          stretch of river.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <a href={csvHref} className={btn}>Download all readings (CSV)</a>
          <RiverLink href="/explore/spills/map#water-quality" className={btn}>See it on the map</RiverLink>
          {worksHref && (
            <RiverLink href={worksHref} className="flex min-h-[44px] items-center rounded-[6px] bg-brand-navy px-4 text-[14px] font-semibold text-white hover:bg-brand-navyDeep">
              Compare above and below the works
            </RiverLink>
          )}
        </div>

        <section aria-labelledby="all-h" className="space-y-3 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="all-h" className="text-[16px] font-semibold text-rh-ink">
              Every reading: {selected}{unit ? ` (${unit})` : ""}
            </h2>
            <EaDeterminandSelect notation={note} determinands={determinands} current={selected} />
          </div>
          <p className="text-[13px] text-rh-ink3">
            EA sampling point {note}{pt?.wb_name ? ` · ${pt.wb_name}` : ""} · {samples.length.toLocaleString()} readings of {determinands.length} tests
            {pt?.first_sample ? ` since ${pt.first_sample.slice(0, 4)}` : ""}.
          </p>
          {points.length > 0 ? (
            <TimeSeriesChart points={points} unit={unit} thresholds={[]} />
          ) : (
            <p className="text-[14px] text-rh-ink3">No numeric results to plot for this test.</p>
          )}
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 bg-rh-card text-left text-[11px] uppercase tracking-[.06em] text-rh-ink3">
                <tr>
                  <th scope="col" className="py-1.5 pr-4">Date</th>
                  <th scope="col" className="py-1.5 pr-4 text-right">Result</th>
                  <th scope="col" className="py-1.5 pr-4">Unit</th>
                  <th scope="col" className="py-1.5 pr-4">Sample</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-rh-rowDiv">
                    <td className="py-1 pr-4">{r.sampled_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1 pr-4 text-right font-plexmono tabular-nums">{r.result == null ? "–" : `${r.result_qualifier === "<" ? "< " : ""}${r.result}`}</td>
                    <td className="py-1 pr-4 text-rh-ink3">{r.unit ?? "–"}</td>
                    <td className="py-1 pr-4 text-rh-ink3">{[r.sample_material, r.purpose].filter(Boolean).join(" · ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[12px] text-rh-ink3">
          Source: Environment Agency Water Quality Archive, Open Government Licence. The regulator&rsquo;s own monitoring of the {b.riverName}.
        </p>
      </PageBody>
    </>
  );
}
