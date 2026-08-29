"use client";

import dynamic from "next/dynamic";
import type { SpillPin } from "@/components/public/SpillMapView";

const SpillMapView = dynamic(() => import("@/components/public/SpillMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[3px] border border-rh-line bg-rh-card text-[13px] text-rh-ink3" style={{ height: "70vh" }}>
      Loading map…
    </div>
  ),
});

export function SpillMap(props: { pins: SpillPin[]; height?: string }) {
  return <SpillMapView {...props} />;
}
