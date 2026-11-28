import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { regulatorFor } from "@/lib/nation";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { cachedRiverJson } from "@/lib/publicData";
import { BAND_META, TEST_META, fmt, periodLabel, siteName, type PairTest, type WorksPairs } from "@/lib/riverHealth";

// "Above and below the works": EA river samples either side of one sewage works, with the works'
// own effluent samples (migration 0115). Linked from the River health page.
export const revalidate = 3600;

type WorksRow = { works_asset_id: string | null; works_name: string | null; works_hours: number | null };

// Same normalisation as ea_wq_works_key() in SQL: name up to "STW", letters only, no NEW/OLD suffix.
function worksKey(name: string): string {
  return name
    .replace(/_.*$/, "")
    .replace(/\s*(STW|S\s*T\s*W|SEWAGE TREATMENT WORKS|WWTW|WRC|INLET)\b.*$/i, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .replace(/(NEW|OLD)$/, "");
}

async function load(key: string) {
  const river = await getCurrentRiver();
  if (!river) return null;
  const supabase = createPublicClient();
  const [pairs, works] = await Promise.all([
    cachedRiverJson<WorksPairs>("public_works_wq_pairs", river.orgId),
    publicRpc<WorksRow>(supabase, "public_spills_works", { p_org: river.orgId }),
  ]);
  const w = pairs?.works.find((x) => x.key === key);
  if (!w) return null;
  const match = works.find((r) => r.works_name && worksKey(r.works_name) === key);
  return { pairs: pairs!, w, match };
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  const d = await load(decodeURIComponent(key));
  if (!d) return { title: `River health — ${b.portalName}` };
  return {
    title: `${d.w.name} works: above and below — ${b.portalName}`,
    description: `${reg.name} samples of the river above and below ${d.w.name} sewage works on the ${b.riverName}: phosphate and ammonia either side of the works, and its treated effluent.`,
  };
}

function headline(t: PairTest, name: string): string {
  const title = TEST_META[t.test].title;
  if (t.ds_band === t.us_band) return `${title} is ${BAND_META[t.ds_band].label.toLowerCase()} both above and below ${name} works`;
  const worse = TEST_META[t.test].lowerIsBetter ? t.ds_mean > t.us_mean : t.ds_mean < t.us_mean;
  return `${title} goes from ${BAND_META[t.us_band].label.toLowerCase()} above ${name} works to ${BAND_META[t.ds_band].label.toLowerCase()} below it${worse ? "" : ", an improvement"}`;
}

function Side({ where, label, mean, n, band, test }: { where: string; label: string; mean: number; n: number; band: PairTest["us_band"]; test: PairTest["test"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold uppercase tracking-[.08em] text-rh-label">{where}</span>
      <span className="text-[14.5px] text-rh-ink">{siteName(label)}</span>
      <span className="font-mono text-[40px] font-medium leading-none" style={{ color: BAND_META[band].text }}>{fmt(test, mean)}</span>
      <span className="text-[13px] text-rh-ink2">{BAND_META[band].label} · {n} samples</span>
    </div>
  );
}

export default async function WorksAboveBelowPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const d = await load(decodeURIComponent(key));
  if (!d) notFound();
  const { pairs, w, match } = d;
  const reg = regulatorFor((await getBranding()).nation); // the EA, or NRW on a Welsh river
  const period = periodLabel(pairs.from_year, pairs.year);
  const lead = w.tests.find((t) => t.test === "phosphate") ?? w.tests[0];
  const scale = Math.max(...w.tests.filter((t) => t.test === lead.test).flatMap((t) => [t.us_mean, t.ds_mean])) * 1.15 || 1;

  return (
    <>
      <PageHeaderBand
        title={headline(lead, w.name)}
        intro={
          <>
            {reg.TheName} samples the river above and below {w.name} sewage works
            {w.tests.some((t) => t.fe_mean != null) ? ", and the works' own treated effluent" : ""}. Read together, they show
            what the works adds. Averages over {period}.
          </>
        }
      />
      <PageBody className="space-y-6">
        {w.tests.map((t) => (
          <section key={t.test} aria-labelledby={`h-${t.test}`} className="space-y-5 rounded-[12px] border border-rh-line bg-rh-card px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`h-${t.test}`} className="text-[18px] font-semibold text-rh-ink">{TEST_META[t.test].title} ({TEST_META[t.test].unit})</h2>
              <span className="text-[13px] text-rh-ink3">Flow →</span>
            </div>
            <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)]">
              <Side where="Above the works" label={t.us_label} mean={t.us_mean} n={t.us_n} band={t.us_band} test={t.test} />
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="flex h-[68px] w-[68px] items-center justify-center rounded-[14px] bg-brand-navyDeep px-1 text-[11.5px] font-semibold leading-tight text-white">
                  {w.name} works
                </div>
                <span className="text-[12px] text-rh-ink3">treated effluent enters here</span>
              </div>
              <Side where="Below the works" label={t.ds_label} mean={t.ds_mean} n={t.ds_n} band={t.ds_band} test={t.test} />
            </div>
            {t.test === lead.test && (
              <div className="space-y-2" aria-hidden="true">
                {[{ k: "Above", v: t.us_mean, b: t.us_band }, { k: "Below", v: t.ds_mean, b: t.ds_band }].map((r) => (
                  <div key={r.k} className="grid grid-cols-[70px_minmax(0,1fr)_64px] items-center gap-3 text-[13.5px]">
                    <span className="text-rh-ink2">{r.k}</span>
                    <div className="h-3.5 rounded-full bg-rh-rowDiv">
                      <div className="h-3.5 rounded-full" style={{ width: `${Math.max(2, (r.v / scale) * 100)}%`, background: BAND_META[r.b].bg }} />
                    </div>
                    <span className="text-right font-mono">{fmt(t.test, r.v)}</span>
                  </div>
                ))}
              </div>
            )}
            {t.fe_mean != null && (
              <p className="text-[13.5px] leading-[1.55] text-rh-ink2">
                In the works&rsquo; treated effluent ({siteName(t.fe_label ?? "")}): <span className="font-mono text-rh-ink">{fmt(t.test, t.fe_mean)} {TEST_META[t.test].unit}</span>, {t.fe_n} samples.
              </p>
            )}
          </section>
        ))}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[10px] border border-rh-alarmBorder bg-rh-alarmTint px-5 py-4 text-[14px] leading-[1.55] text-rh-ink2">
            <h2 className="mb-1 text-[15px] font-semibold text-rh-ink">Storm overflows are not in these averages</h2>
            <p>
              {reg.The} samples on a schedule, rarely during a spill, so untreated sewage from the works&rsquo; storm overflow
              barely shows here.{" "}
              {match?.works_asset_id ? (
                <>
                  {match.works_hours != null && <>The works&rsquo; overflow spilled for {match.works_hours.toLocaleString()} hours in the latest full year. </>}
                  <RiverLink href={`/explore/spills/${match.works_asset_id}`} className="font-semibold text-rh-teal hover:underline">See its spills</RiverLink>
                </>
              ) : (
                <RiverLink href="/explore/spills" className="font-semibold text-rh-teal hover:underline">See the river&rsquo;s spills</RiverLink>
              )}
            </p>
          </div>
          <div className="rounded-[10px] border border-rh-line bg-rh-card px-5 py-4 text-[13.5px] leading-[1.55] text-rh-ink2">
            <h2 className="mb-1 text-[15px] font-semibold text-rh-ink">How these are matched</h2>
            <p>
              River Hub pairs sampling points {reg.the} names as upstream (&ldquo;U/S&rdquo;) and downstream (&ldquo;D/S&rdquo;) of
              the same works. Bands are indicative Water Framework Directive standards; readings below the lab&rsquo;s detection
              limit count at half the limit. Source: {reg.wqSource}, Open Government Licence.
            </p>
          </div>
        </div>

        <RiverLink href="/explore/health" className="inline-block text-[14px] font-semibold text-rh-teal hover:underline">← River health</RiverLink>
      </PageBody>
    </>
  );
}
