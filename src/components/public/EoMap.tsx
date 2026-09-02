"use client";

import dynamic from "next/dynamic";
import type { EoRow } from "@/lib/emergencyOverflows";

const EoMapView = dynamic(() => import("@/components/public/EoMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[3px] border border-rh-line bg-rh-card text-[13px] text-rh-ink3" style={{ height: "62vh" }}>
      Loading map…
    </div>
  ),
});

export function EoMap(props: { rows: EoRow[]; height?: string }) {
  return <EoMapView {...props} />;
}
