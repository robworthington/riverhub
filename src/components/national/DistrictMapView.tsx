"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import type { Feature, Geometry } from "geojson";

export interface DistrictMapRiver {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  gaps: number;
  overflows: number;
}

function FitBounds({ feature, pts }: { feature: Feature<Geometry> | null; pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    let bounds: L.LatLngBounds | null = null;
    if (feature) {
      try {
        bounds = L.geoJSON(feature).getBounds();
      } catch {
        bounds = null;
      }
    }
    for (const p of pts) bounds = bounds ? bounds.extend(p) : L.latLngBounds(p, p);
    if (!bounds || !bounds.isValid()) return;
    const b = bounds;
    // The map mounts client-side inside a flex layout, so its container can still be unsized when this
    // first runs; fitting then zooms to the maximum. Re-measure, fit, and fit again once layout settles.
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(b, { padding: [16, 16] });
    };
    fit();
    const raf = requestAnimationFrame(fit);
    const t = setTimeout(fit, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [map, feature, pts]);
  return null;
}

// Dot area tracks gaps (radius ~ sqrt), so a river with 100 gaps reads as ~10x one with 1, not 100x.
function radiusFor(gaps: number, max: number): number {
  if (max <= 0) return 6;
  return 5 + 13 * Math.sqrt(gaps / max);
}

/** River basin district map: the district outline plus one dot per covered river, sized by gaps. */
export default function DistrictMapView({
  boundary,
  rivers,
  height = "440px",
}: {
  boundary: string | null;
  rivers: DistrictMapRiver[];
  height?: string;
}) {
  const feature = useMemo<Feature<Geometry> | null>(
    () => (boundary ? { type: "Feature", properties: {}, geometry: JSON.parse(boundary) as Geometry } : null),
    [boundary],
  );
  const pts = useMemo<[number, number][]>(() => rivers.map((r) => [r.lat, r.lng]), [rivers]);
  const maxGaps = Math.max(0, ...rivers.map((r) => r.gaps));
  // Draw small dots last so they sit on top of big neighbours.
  const ordered = [...rivers].sort((a, b) => b.gaps - a.gaps);

  return (
    <div className="w-full overflow-hidden rounded-[6px] border border-brand-line2" style={{ height }}>
      <MapContainer center={[52.8, -1.6]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {feature && (
          <GeoJSON
            key={boundary?.length}
            data={feature}
            style={{ color: "#1B4468", weight: 2, fillColor: "#1B4468", fillOpacity: 0.05 } as never}
          />
        )}
        {ordered.map((r) => (
          <CircleMarker
            key={r.slug}
            center={[r.lat, r.lng]}
            radius={radiusFor(r.gaps, maxGaps)}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: r.gaps > 0 ? "#A03A2B" : "#1B4468",
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <strong>{r.name}</strong>
              <br />
              <span className="text-xs">
                {r.gaps} {r.gaps === 1 ? "gap" : "gaps"} · {r.overflows} overflows
              </span>
              <br />
              <a href={`/r/${r.slug}/explore/spills`}>Open this river →</a>
            </Popup>
          </CircleMarker>
        ))}
        <FitBounds feature={feature} pts={pts} />
      </MapContainer>
    </div>
  );
}
