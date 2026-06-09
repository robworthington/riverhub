"use client";

import dynamic from "next/dynamic";
import type { MapStation, MapStationAsset } from "@/components/StationMapView";

const StationMapView = dynamic(() => import("@/components/StationMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500" style={{ height: "420px" }}>
      Loading map…
    </div>
  ),
});

export function StationMap(props: { stations: MapStation[]; assets?: MapStationAsset[]; height?: string }) {
  return <StationMapView {...props} />;
}
