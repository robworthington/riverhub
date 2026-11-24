"use client";

import dynamic from "next/dynamic";
import type { DistrictShape, NationalRiver } from "@/lib/national-data";

// Leaflet touches window, so the map renders client-side only.
const NationalMapView = dynamic(() => import("@/components/national/NationalMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[540px] items-center justify-center rounded-[6px] border border-brand-line2 bg-brand-surface text-[13px] text-brand-label">
      Loading map…
    </div>
  ),
});

export function NationalMap(props: { districts: DistrictShape[]; rivers: NationalRiver[]; incidents?: Record<string, number>; height?: number }) {
  return <NationalMapView {...props} />;
}
