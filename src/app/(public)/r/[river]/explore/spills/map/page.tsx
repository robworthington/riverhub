import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { SpillMap } from "@/components/public/SpillMap";
import { StatusDot } from "@/components/public/StatusDot";
import { derive, type BoardRow, type LiveStatus } from "@/lib/spillStatus";
import { overflowLabel } from "@/lib/overflowNames";
import type { SpillPin } from "@/components/public/SpillMapView";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { publicRpc } from "@/lib/supabase/publicRpc";

// Cached for 10 min (ISR) so a traffic spike is served from cache, not the DB per request
export const revalidate = 600;

export const metadata: Metadata = {
  title: `Live spill map — ${INSTANCE.portalName}`,
  description: `Live storm-overflow status across the ${INSTANCE.riverName} catchment — which overflows are spilling now, which stopped recently, and which feeds have gone quiet.`,
};

type PinRow = {
  asset_id: string; asset_name: string; lat: number; lng: number;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_spill_end: string | null; last_updated: string | null;
};

export default async function SpillMapPage() {
  const supabase = createPublicClient();
  // pins carry coordinates + live status; the board (all years) carries the dry / pre-STW flag counts
  const [rows, boardData] = await Promise.all([
    publicRpc<PinRow>(supabase, "public_spill_pins", {}, { required: true }),
    publicRpc<BoardRow>(supabase, "public_spills_board", { p_year: null }, { required: true }),
  ]);
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
        intro={<>Every monitored storm overflow in the {INSTANCE.riverName} catchment, coloured by its current status. Click a pin for its history.</>}
      />
      <PageBody className="space-y-5">
      <SpillMap pins={pins} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-rh-ink2">
        <Legend status="spilling" label={`Spilling now (${counts.spilling})`} />
        <Legend status="recent" label={`Spilled in last 48h (${counts.recent})`} />
        <Legend status="ok" label={`Not spilling (${counts.ok})`} />
        <Legend status="nodata" label={`No data from feed (${counts.nodata})`} />
      </div>
      </PageBody>
    </>
  );
}

function Legend({ status, label }: { status: LiveStatus; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot status={status} live={status === "spilling"} />
      {label}
    </span>
  );
}
