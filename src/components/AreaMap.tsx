"use client";

import dynamic from "next/dynamic";
import type { AreaMapSite, AreaMapAsset } from "@/components/AreaMapView";

const AreaMapView = dynamic(() => import("@/components/AreaMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500" style={{ height: "420px" }}>
      Loading map…
    </div>
  ),
});

export function AreaMap(props: { boundary: string | null; sites: AreaMapSite[]; assets: AreaMapAsset[]; height?: string; linkBase?: string; publicMode?: boolean }) {
  return <AreaMapView {...props} />;
}
