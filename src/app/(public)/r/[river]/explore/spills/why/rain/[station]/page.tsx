import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { regulatorFor } from "@/lib/nation";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { RainBars } from "@/components/public/RainFlowCharts";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { EA_THRESHOLD_MM } from "@/lib/dryspill";
import { overflowLabel } from "@/lib/overflowNames";

// One EA rain gauge (migration 0123): a year of daily rainfall and the overflows judged against it.
export const revalidate = 3600;

type Station = {
  id: string; name: string; ea_station_id: string | null;
  readings: [string, number | null][];
  overflows: { id: string; name: string; type: string | null }[];
};

async function load(id: string): Promise<Station | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const river = await getCurrentRiver();
  if (!river) return null;
  const d = await publicRpc(createPublicClient(), "public_rain_station", { p_org: river.orgId, p_station: id });
  return (d && !Array.isArray(d) ? d : null) as Station | null;
}

export async function generateMetadata({ params }: { params: Promise<{ station: string }> }): Promise<Metadata> {
  const { station } = await params;
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  const s = await load(station);
  return {
    title: `${s ? `${s.name} rain gauge` : "Rain gauge"} — ${b.portalName}`,
    description: s ? `Daily rainfall at ${reg.nameInSentence}'s ${s.name} gauge, and the ${s.overflows.length} overflows on the ${b.riverName} whose spills are judged dry or wet against it.` : undefined,
  };
}

export default async function RainStationPage({ params }: { params: Promise<{ station: string }> }) {
  const { station } = await params;
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  const s = await load(station);
  if (!s) notFound();

  const pts = s.readings.filter(([, v]) => v != null) as [string, number][];
  const total = pts.reduce((a, [, v]) => a + v, 0);
  const wet = pts.filter(([, v]) => v > EA_THRESHOLD_MM).length;
  const wettest = pts.reduce<[string, number] | null>((m, p) => (!m || p[1] > m[1] ? p : m), null);
  const first = pts[0]?.[0];
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeaderBand
        label={reg.gaugeLabel}
        title={s.name}
        intro={
          <>
            {s.overflows.length > 0
              ? <>The nearest gauge to {s.overflows.length} {s.overflows.length === 1 ? "overflow" : "overflows"} on the {b.riverName}: their spills are judged dry or wet against its readings.</>
              : <>A gauge in the {b.riverName} catchment. It isn&rsquo;t the nearest to any overflow.</>}
          </>
        }
      />
      <PageBody className="space-y-7">
        <RiverLink href="/explore/spills/why/rain" className="text-[14px] text-rh-teal hover:underline">← All rain gauges</RiverLink>

        {pts.length === 0 ? (
          <p className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] text-rh-ink2">No readings in the last year.</p>
        ) : (
          <section aria-labelledby="rain-h" className="space-y-3 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="rain-h" className="text-[16px] font-semibold text-rh-ink">Daily rainfall since {fmt(first!)}</h2>
              <span className="font-plexmono text-[13px] text-rh-ink2">
                {total.toFixed(0)} mm · {wet} wet {wet === 1 ? "day" : "days"} of {pts.length}
              </span>
            </div>
            <RainBars readings={s.readings} threshold={EA_THRESHOLD_MM}
              label={`Daily rainfall at ${s.name}: ${total.toFixed(0)} mm over ${pts.length} days, ${wet} of them wet`} />
            <p className="text-[12.5px] text-rh-ink3">
              Dark bars: wet days (more than {EA_THRESHOLD_MM} mm). Light bars: dry days. Gaps: no reading.
              {wettest && <> Wettest day: {fmt(wettest[0])}, {wettest[1]} mm.</>}
            </p>
          </section>
        )}

        {s.overflows.length > 0 && (
          <section aria-labelledby="ov-h" className="space-y-3">
            <h2 id="ov-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">Overflows judged against this gauge</h2>
            <ul className="grid gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
              {s.overflows.map((o) => (
                <li key={o.id}>
                  <RiverLink href={`/explore/spills/${o.id}`} className="text-rh-teal hover:underline">{overflowLabel(o.name, o.type ?? undefined)}</RiverLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[12px] leading-[1.5] text-rh-ink3">
          Source: {reg.rainSource}{s.ea_station_id ? ` (station ${s.ea_station_id})` : ""}, Open Government Licence.
          Daily totals, checked by River Hub each day.
        </p>
      </PageBody>
    </>
  );
}
