"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export function ChoroplethClient({ data }: { data: FeatureCollection }) {
  return <ChoroplethMap data={data} />;
}
