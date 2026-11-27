"use client";

import dynamic from "next/dynamic";
import type { SpillPin, VolunteerPin } from "@/components/public/SpillMapView";
import type { PublicIncident } from "@/lib/incidents";
import type { WqMap } from "@/lib/riverHealth";
import type { PublicAsk } from "@/lib/wdtkTopics";

const SpillMapView = dynamic(() => import("@/components/public/SpillMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[3px] border border-rh-line bg-rh-card text-[13px] text-rh-ink3" style={{ height: "70vh" }}>
      Loading map…
    </div>
  ),
});

export function SpillMap(props: { pins: SpillPin[]; incidents?: PublicIncident[]; wq?: WqMap | null; asks?: PublicAsk[]; volunteer?: VolunteerPin[]; riverName?: string; riverSlug?: string; height?: string; incidentsOn?: boolean }) {
  return <SpillMapView {...props} />;
}
