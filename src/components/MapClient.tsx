"use client";

import dynamic from "next/dynamic";
import type { MapSite, MapAsset, MapEaSite } from "@/components/MapView";

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
  eaSites,
  height,
  zoom,
}: {
  sites: MapSite[];
  assets: MapAsset[];
  eaSites?: MapEaSite[];
  height?: string;
  zoom?: number;
}) {
  return <MapView sites={sites} assets={assets} eaSites={eaSites} height={height} zoom={zoom} />;
}
