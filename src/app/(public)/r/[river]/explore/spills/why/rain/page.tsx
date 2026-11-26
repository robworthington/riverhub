import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { FlowLine } from "@/components/public/RainFlowCharts";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { EA_THRESHOLD_MM } from "@/lib/dryspill";

// Rain and river flow (migration 0123): the Environment Agency gauges the dry-spill test uses for this
// river. Open EA data; until Nov 2026 only signed-in members could see it. Daily data, cached an hour.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Rain and river flow — ${b.portalName}`,
    description: `The Environment Agency rain gauges and river-flow gauges River Hub uses to judge whether a spill on the ${b.riverName} happened in dry weather: recent rainfall at each gauge and the overflows it covers.`,
  };
}

type Station = {
  id: string; name: string; latest: string | null; rain_7d: number; rain_30d: number;
  wet_days_30: number; days_30: number; overflows: number;
};
type Gauge = { id: string; name: string; ea_station_id: string | null; readings: [string, number | null][] };

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";

export default async function RainFlowPage() {
  const b = await getBranding();
  const river = await getCurrentRiver();
  const supabase = createPublicClient();
  const [stations, flowData] = river
    ? await Promise.all([
        publicRpc<Station>(supabase, "public_rain_stations", { p_org: river.orgId }),
        publicRpc(supabase, "public_flow_gauges", { p_org: river.orgId }),
      ])
    : [[] as Station[], [] as unknown[]];
  const gauges = (Array.isArray(flowData) ? flowData : []) as Gauge[];
  const used = stations.filter((s) => s.overflows > 0);
  const unused = stations.length - used.length;

  return (
    <>
      <PageHeaderBand
        title="Rain and river flow"
        intro={
          <>
            Whether a spill counts as &ldquo;dry&rdquo; depends on the rain gauge nearest each overflow. These are the
            Environment Agency gauges River Hub uses for the {b.riverName}, and what they have recorded.
          </>
        }
      />
      <PageBody className="space-y-8">
        <div className="max-w-[780px] rounded-[10px] border border-rh-line bg-rh-card px-6 py-5 text-[15px] leading-[1.6] text-rh-ink2">
          <strong className="text-rh-ink">How River Hub uses them.</strong> Each overflow is matched to its nearest rain gauge.
          A spill is counted as dry when that gauge recorded no more than {EA_THRESHOLD_MM} mm on the day the spill started
          and on the day before. If either day is missing from the gauge, the spill isn&rsquo;t called dry or wet.{" "}
          <RiverLink href="/explore/spills/why/dry" className="font-semibold text-rh-teal hover:underline">See dry spilling</RiverLink>
        </div>

        <section aria-labelledby="gauges-h" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="gauges-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">Rain gauges</h2>
            <span className="text-[13px] text-rh-ink3">Last 30 days · a wet day is more than {EA_THRESHOLD_MM} mm</span>
          </div>
          {used.length === 0 ? (
            <p className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] text-rh-ink2">
              No rain gauges have been matched to overflows on the {b.riverName} yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-rh-line bg-white">
              <table className="min-w-full text-[14px]">
                <thead className="bg-rh-cardAlt text-left text-[11.5px] uppercase tracking-[.06em] text-rh-ink3">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Gauge</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Overflows</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Last 7 days</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Last 30 days</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Wet days</th>
                    <th scope="col" className="px-4 py-2.5">Latest reading</th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((s) => (
                    <tr key={s.id} className="border-t border-rh-rowDiv">
                      <td className="px-4 py-2.5">
                        <RiverLink href={`/explore/spills/why/rain/${s.id}`} className="font-semibold text-rh-teal hover:underline">{s.name}</RiverLink>
                      </td>
                      <td className="px-4 py-2.5 text-right font-plexmono">{s.overflows}</td>
                      <td className="px-4 py-2.5 text-right font-plexmono">{Number(s.rain_7d).toFixed(1)} mm</td>
                      <td className="px-4 py-2.5 text-right font-plexmono">{Number(s.rain_30d).toFixed(1)} mm</td>
                      <td className="px-4 py-2.5 text-right font-plexmono">{s.wet_days_30} of {s.days_30}</td>
                      <td className="px-4 py-2.5 text-rh-ink2">{fmtDate(s.latest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {unused > 0 && (
            <p className="text-[13px] text-rh-ink3">
              {unused} more {unused === 1 ? "gauge is" : "gauges are"} in the catchment but {unused === 1 ? "isn't" : "aren't"} the nearest to any overflow.
            </p>
          )}
        </section>

        {gauges.length > 0 && (
          <section aria-labelledby="flow-h" className="space-y-3">
            <h2 id="flow-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">River flow</h2>
            <p className="max-w-[720px] text-[14.5px] leading-[1.55] text-rh-ink2">
              Daily mean flow at the Environment Agency&rsquo;s gauging station. Low flow means less water to dilute a spill.
            </p>
            {gauges.map((g) => {
              const last = [...g.readings].reverse().find(([, v]) => v != null);
              return (
                <div key={g.id} className="space-y-2 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[16px] font-semibold text-rh-ink">{g.name}</h3>
                    {last && <span className="font-plexmono text-[13px] text-rh-ink2">{Number(last[1]).toFixed(2)} m³/s on {fmtDate(last[0])}</span>}
                  </div>
                  {g.readings.length > 1 ? (
                    <FlowLine readings={g.readings} label={`Daily mean river flow at ${g.name} over the last year`} />
                  ) : (
                    <p className="text-[14px] text-rh-ink3">No flow readings in the last year.</p>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <p className="text-[12px] leading-[1.5] text-rh-ink3">
          Source: Environment Agency rainfall and flow data (Hydrology and flood-monitoring APIs), Open Government Licence.
          Readings are daily totals (rain) and daily means (flow), checked by River Hub each day.
        </p>
      </PageBody>
    </>
  );
}
