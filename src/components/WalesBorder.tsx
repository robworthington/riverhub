"use client";

import { GeoJSON, Pane } from "react-leaflet";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

// The Wales–England land border (Dee estuary to the Wye at Chepstow), drawn on every public map so a
// reader can see which side of the border a river or overflow is on: the regulator, the baseline year
// and the length of the spill record all change at it. public/geo/wales-border.geojson was cut from
// ONS Countries (December 2024) Boundaries UK BGC (OGL v3): only the stretch Wales shares with England,
// since the coast is already on the basemap. 24 KB, fetched once per page and shared by every map.
// middleware.ts must leave .geojson alone, or the request is answered with a sign-in page.
export const BORDER_STYLE = { color: "#3d4a55", weight: 2, opacity: 0.75, dashArray: "9 4 2 4" } as const;

let cached: Promise<FeatureCollection> | null = null;
function loadBorder(): Promise<FeatureCollection> {
  cached ??= fetch("/geo/wales-border.geojson").then((r) => {
    if (!r.ok) throw new Error(`border ${r.status}`);
    return r.json() as Promise<FeatureCollection>;
  });
  cached.catch(() => { cached = null; });
  return cached;
}

/** Put inside a react-leaflet MapContainer. Draws nothing until the line has loaded, or if it fails. */
export function WalesBorder() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let live = true;
    loadBorder().then((d) => live && setData(d)).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!data) return null;
  // Its own pane above the district and catchment fills (overlayPane, 400) and below markers (600),
  // and not interactive, so it never takes a click or tooltip meant for what is underneath.
  return (
    <Pane name="wales-border" style={{ zIndex: 450, pointerEvents: "none" }}>
      <GeoJSON data={data} interactive={false} style={BORDER_STYLE as never} attribution="Border &copy; ONS (OGL)" />
    </Pane>
  );
}

/** A legend swatch matching the line. */
export function WalesBorderKey({ label = "Wales–England border" }: { label?: string }) {
  return (
    <span className="flex items-center gap-2">
      <svg aria-hidden="true" width="22" height="8" viewBox="0 0 22 8">
        <line x1="0" y1="4" x2="22" y2="4" stroke={BORDER_STYLE.color} strokeWidth="2" strokeDasharray="9 4 2 4" />
      </svg>
      {label}
    </span>
  );
}
