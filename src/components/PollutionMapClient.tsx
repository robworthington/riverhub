"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import type { SitePin } from "@/components/PollutionMapView";

const PollutionMapView = dynamic(() => import("@/components/PollutionMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export function PollutionMapClient(props: {
  districts: FeatureCollection;
  parishes: FeatureCollection;
  rivers: FeatureCollection;
  sites: SitePin[];
  linkBase?: string;
  unit?: string;
  siteHrefPrefix?: string;
}) {
  return <PollutionMapView {...props} />;
}
