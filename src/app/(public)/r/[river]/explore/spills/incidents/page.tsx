import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { SpillMap } from "@/components/public/SpillMap";
import type { SpillPin } from "@/components/public/SpillMapView";
import { StatCard } from "@/components/public/StatCard";
import { PollutionIncidents } from "@/components/public/PollutionIncidents";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { derive, type BoardRow } from "@/lib/spillStatus";
import { overflowLabel } from "@/lib/overflowNames";
import { fmtIncidentDate, type PublicIncident } from "@/lib/incidents";

// "Now → Pollution incidents": the EA's serious sewage pollution incidents near the river's
// overflows and works (migrations 0100, 0105), with a map, headline counts and every record.
// Cached for 10 min (ISR); the data itself refreshes weekly.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Pollution incidents — ${b.portalName}`,
    description: `Serious sewage pollution incidents the Environment Agency has recorded near storm overflows and treatment works on the ${b.riverName}, with how to ask for each full report.`,
  };
}

type Summary = { total: number; since_2020: number; category_1: number; latest: string | null; refreshed_at: string | null };
type PinRow = {
  asset_id: string; asset_name: string; lat: number; lng: number;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_spill_end: string | null; last_updated: string | null;
};

export default async function IncidentsPage() {
  const b = await getBranding();
  const river = await getCurrentRiver();
  const supabase = createPublicClient();
  const orgArgs = river ? { p_org: river.orgId } : {};
  const [summaryRows, incidents, pinRows] = await Promise.all([
    publicRpc<Summary>(supabase, "public_pollution_incident_summary", orgArgs),
    publicRpc<PublicIncident>(supabase, "public_pollution_incidents", { ...orgArgs, p_limit: 500 }),
    publicRpc<PinRow>(supabase, "public_spill_pins"),
  ]);
  const s = summaryRows[0];
  const loaded = Boolean(s?.refreshed_at);
  const firstYear = incidents.length ? incidents.reduce((m, i) => (i.occurred_on < m ? i.occurred_on : m), incidents[0].occurred_on).slice(0, 4) : null;

  const nowMs = Date.now();
  const pins: SpillPin[] = pinRows.map((r) => ({
    id: r.asset_id,
    name: overflowLabel(r.asset_name),
    lat: r.lat,
    lng: r.lng,
    live: derive({ ...(r as unknown as BoardRow), dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs).status,
  }));

  return (
    <>
      <PageHeaderBand
        title="Pollution incidents"
        intro={
          <>
            When sewage pollution is reported, the Environment Agency investigates and rates the harm it did. These are
            the serious ones it has recorded near the overflows and treatment works on the {b.riverName}.
          </>
        }
      />
      <PageBody className="space-y-6">
        {!loaded || !river ? (
          <p className="max-w-[760px] rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] leading-[1.6] text-rh-ink2">
            The Environment Agency&rsquo;s incident records haven&rsquo;t been loaded yet. River Hub refreshes them every week.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <StatCard accent="ink" value={s.total} caption="Serious incidents on record" subline={firstYear ? `Since ${firstYear}; category 1 and 2, involving sewage` : "Category 1 and 2, involving sewage"} />
              <StatCard accent="ink" value={s.since_2020} caption="Since 2020" subline="Recent ones appear once the EA closes them" />
              <StatCard accent={s.category_1 > 0 ? "alarm" : "ink"} value={s.category_1} caption="Rated major" subline="The EA's highest impact category" />
              <StatCard accent="nodata" value={s.latest ? fmtIncidentDate(s.latest) : "None"} caption="Most recent" subline="Date the incident was recorded" />
            </div>

            {incidents.length > 0 && (
              <section aria-label="Map of incidents" className="space-y-2">
                <SpillMap pins={pins} incidents={incidents} riverName={b.riverName} riverSlug={river.slug} height="60vh" incidentsOn />
                <p className="text-[12px] text-rh-ink3">
                  Diamonds are incidents (larger, with a red edge, when major); dots are overflows, coloured by their live
                  status. Click a diamond for its details.
                </p>
              </section>
            )}

            <section aria-labelledby="incidents-what-h" className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[3px] border border-rh-line bg-rh-card px-5 py-4 text-[13.5px] leading-[1.6] text-rh-ink2">
                <h2 id="incidents-what-h" className="mb-1.5 text-[15px] font-bold text-rh-ink">What these records are</h2>
                <p>
                  Incidents the EA confirmed and closed, rated <strong>major</strong> (category 1) or{" "}
                  <strong>significant</strong> (category 2) for their impact on water, where sewage was among the
                  pollutants and the location is within 1 km of an overflow or works River Hub tracks. Minor incidents
                  aren&rsquo;t published, and investigations still open don&rsquo;t appear yet.
                </p>
              </div>
              <div className="rounded-[3px] border border-rh-line bg-rh-card px-5 py-4 text-[13.5px] leading-[1.6] text-rh-ink2">
                <h2 className="mb-1.5 text-[15px] font-bold text-rh-ink">What they don&rsquo;t say, and how to find out</h2>
                <p>
                  The open data gives only the date, place, severity and pollutant. The cause, the stream affected, any
                  sampling, who was responsible and any enforcement are in the EA&rsquo;s own incident report. Every
                  incident below has an <strong>Ask for the full report</strong> link that starts a public request for it
                  on WhatDoTheyKnow.
                </p>
              </div>
            </section>
          </>
        )}

        {river && <PollutionIncidents orgId={river.orgId} riverName={b.riverName} riverSlug={river.slug} variant="page" />}
      </PageBody>
    </>
  );
}
