import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { SpillMap } from "@/components/public/SpillMap";
import { StatusDot } from "@/components/public/StatusDot";
import { derive, type BoardRow, type LiveStatus } from "@/lib/spillStatus";
import type { SpillPin } from "@/components/public/SpillMapView";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Live spill map — ${INSTANCE.portalName}`,
  description: `Live storm-overflow status across the ${INSTANCE.riverName} catchment — which overflows are spilling now, which stopped recently, and which feeds have gone quiet.`,
};

type PinRow = {
  asset_id: string; asset_name: string; lat: number; lng: number;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_updated: string | null;
};

export default async function SpillMapPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spill_pins" as never, {} as never);
  const rows = (data ?? []) as unknown as PinRow[];
  const nowMs = Date.now();

  const pins: SpillPin[] = rows.map((r) => ({
    id: r.asset_id,
    name: r.asset_name,
    lat: r.lat,
    lng: r.lng,
    live: derive({ ...(r as unknown as BoardRow), dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs).status,
  }));

  const counts = pins.reduce<Record<LiveStatus, number>>(
    (acc, p) => ({ ...acc, [p.live]: acc[p.live] + 1 }),
    { spilling: 0, recent: 0, ok: 0, nodata: 0 },
  );

  return (
    <div className="space-y-5 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Live spill map</h1>
        <p className="mt-2 max-w-[560px] text-[15px] text-rh-ink2">
          Every monitored storm overflow in the {INSTANCE.riverName} catchment, coloured by its current status. Click a pin for its history.
        </p>
      </div>

      <SpillMap pins={pins} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-rh-ink2">
        <Legend status="spilling" label={`Spilling now (${counts.spilling})`} />
        <Legend status="recent" label={`Spilled in last 48h (${counts.recent})`} />
        <Legend status="ok" label={`Not spilling (${counts.ok})`} />
        <Legend status="nodata" label={`No data from feed (${counts.nodata})`} />
      </div>
    </div>
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
