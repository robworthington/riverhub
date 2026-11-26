import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding } from "@/lib/river-context";
import { SpillMap } from "@/components/public/SpillMap";
import { StatusDot } from "@/components/public/StatusDot";
import { derive, type BoardRow, type LiveStatus } from "@/lib/spillStatus";
import { overflowLabel } from "@/lib/overflowNames";
import type { SpillPin } from "@/components/public/SpillMapView";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { LiveSourceCredit } from "@/components/public/LiveSourceCredit";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { getCurrentRiver } from "@/lib/river-context";
import { NIRS_ATTRIBUTION, NIRS_DATASET_URL, type PublicIncident } from "@/lib/incidents";
import type { WqMap } from "@/lib/riverHealth";
import type { PublicAsk } from "@/lib/wdtkTopics";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
  title: `Live spill map — ${b.portalName}`,
  description: `Live storm-overflow status across the ${b.riverName} catchment — which overflows are spilling now, which stopped recently, and which feeds have gone quiet.`,
  };
}

type PinRow = {
  asset_id: string; asset_name: string; lat: number; lng: number;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_spill_end: string | null; last_updated: string | null;
};

export default async function SpillMapPage() {
  const b = await getBranding();
  const supabase = createPublicClient();
  // pins carry coordinates + live status; the board (all years) carries the dry / pre-STW flag counts
  const river = await getCurrentRiver();
  const [rows, boardData, incidents, wqData, asks] = await Promise.all([
    publicRpc<PinRow>(supabase, "public_spill_pins", {}, { required: true }),
    publicRpc<BoardRow>(supabase, "public_spills_board", { p_year: null }, { required: true }),
    // EA serious sewage incidents near the river's network (migrations 0100, 0105); [] until loaded
    river ? publicRpc<PublicIncident>(supabase, "public_pollution_incidents", { p_org: river.orgId, p_limit: 500 }) : Promise.resolve([] as PublicIncident[]),
    // EA water-quality sampling points with their bands (migration 0117); optional layer
    river ? publicRpc(supabase, "public_wq_map_points", { p_org: river.orgId }) : Promise.resolve(null),
    // incident reports already requested from public pages (0119)
    river ? publicRpc<PublicAsk>(supabase, "public_wdtk_topics", { p_org: river.orgId }) : Promise.resolve([] as PublicAsk[]),
  ]);
  const wq = (wqData && !Array.isArray(wqData) ? wqData : null) as WqMap | null;
  const flags = new Map(
    boardData.map((b) => [b.asset_id, { dry: b.dry, preStw: b.pre_stw }]),
  );
  const nowMs = Date.now();

  const pins: SpillPin[] = rows.map((r) => {
    const f = flags.get(r.asset_id);
    return {
      id: r.asset_id,
      name: overflowLabel(r.asset_name),
      lat: r.lat,
      lng: r.lng,
      live: derive({ ...(r as unknown as BoardRow), dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs).status,
      dry: f?.dry,
      preStw: f?.preStw,
    };
  });

  const counts = pins.reduce<Record<LiveStatus, number>>(
    (acc, p) => ({ ...acc, [p.live]: acc[p.live] + 1 }),
    { spilling: 0, recent: 0, ok: 0, nodata: 0 },
  );

  return (
    <>
      <PageHeaderBand
        title="Live spill map"
        intro={<>Every monitored storm overflow in the {b.riverName} catchment, coloured by its current status. Click a pin for its history.</>}
      />
      <PageBody className="space-y-5">
      <SpillMap pins={pins} incidents={incidents} wq={wq} asks={asks} riverName={b.riverName} riverSlug={river?.slug ?? ""} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-rh-ink2">
        <Legend status="spilling" label={`Spilling now (${counts.spilling})`} />
        <Legend status="recent" label={`Spilled in last 48h (${counts.recent})`} />
        <Legend status="ok" label={`Not spilling (${counts.ok})`} />
        <Legend status="nodata" label={`No data from feed (${counts.nodata})`} />
      </div>

      {wq && wq.points.length > 0 && (
        <p className="text-[11.5px] leading-[1.5] text-rh-ink3">
          EA water quality: Environment Agency lab tests of river samples, averaged over three years and banded against
          the Water Framework Directive river standards, as on the{" "}
          <RiverLink href="/explore/health" className="underline-offset-2 hover:underline">River health</RiverLink> page.
          Source: EA Water Quality Archive, Open Government Licence.
        </p>
      )}

      {incidents.length > 0 && (
        <p className="text-[11.5px] leading-[1.5] text-rh-ink3">
          Pollution incidents: Environment Agency records of closed category 1 (major) and 2 (significant) incidents
          involving sewage, within 1 km of the overflows above, via the{" "}
          <a href={NIRS_DATASET_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">open dataset</a>.
          Locations rounded to about 100 m. {NIRS_ATTRIBUTION}
        </p>
      )}

      <LiveSourceCredit companyName={b.companyName} />
      </PageBody>
    </>
  );
}

function Legend({ status, label }: { status: LiveStatus; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot status={status} size={12} />
      {label}
    </span>
  );
}
