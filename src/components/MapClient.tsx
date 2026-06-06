"use client";

import dynamic from "next/dynamic";
import type { MapSite, MapAsset } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export function MapClient({ sites, assets }: { sites: MapSite[]; assets: MapAsset[] }) {
  return <MapView sites={sites} assets={assets} />;
}
