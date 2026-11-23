"use client";

import dynamic from "next/dynamic";
import type { DistrictMapRiver } from "@/components/national/DistrictMapView";

// Leaflet touches window, so the map only renders client-side.
const DistrictMapView = dynamic(() => import("@/components/national/DistrictMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[6px] border border-brand-line2 bg-brand-surface text-[13px] text-brand-label" style={{ height: "440px" }}>
      Loading map…
    </div>
  ),
});

export type { DistrictMapRiver };

export function DistrictMap(props: { boundary: string | null; rivers: DistrictMapRiver[]; height?: string }) {
  return <DistrictMapView {...props} />;
}
