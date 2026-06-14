"use client";

import dynamic from "next/dynamic";
import type { EvidencePoint } from "@/components/EvidenceMapView";

const EvidenceMapView = dynamic(() => import("@/components/EvidenceMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500" style={{ height: "340px" }}>
      Loading map…
    </div>
  ),
});

export function EvidenceMap(props: { asset: EvidencePoint; gauge: EvidencePoint | null; distanceKm: number | null; height?: string }) {
  return <EvidenceMapView {...props} />;
}
