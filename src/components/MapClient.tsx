"use client";

import dynamic from "next/dynamic";
import type { MapSite, MapAsset } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500" style={{ height: "70vh" }}>
      Loading map…
    </div>
  ),
});

export function MapClient({
  sites,
  assets,
  height,
  zoom,
}: {
  sites: MapSite[];
  assets: MapAsset[];
  height?: string;
  zoom?: number;
}) {
  return <MapView sites={sites} assets={assets} height={height} zoom={zoom} />;
}
