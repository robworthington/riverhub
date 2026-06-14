"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";

export interface EvidencePoint { lat: number; lng: number; label: string }

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 });
  }, [map, pts]);
  return null;
}

// Asset outlet vs its matched rain gauge, with the distance line between them — the spatial
// evidence for whether the gauge represents the outlet's catchment.
export default function EvidenceMapView({
  asset,
  gauge,
  distanceKm,
  height = "340px",
}: {
  asset: EvidencePoint;
  gauge: EvidencePoint | null;
  distanceKm: number | null;
  height?: string;
}) {
  const pts: [number, number][] = [[asset.lat, asset.lng]];
  if (gauge) pts.push([gauge.lat, gauge.lng]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200" style={{ height }}>
      <MapContainer center={[asset.lat, asset.lng]} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {gauge && (
          <Polyline positions={[[asset.lat, asset.lng], [gauge.lat, gauge.lng]]} pathOptions={{ color: "#6b7280", weight: 2, dashArray: "6 5" }}>
            {distanceKm != null && <Tooltip permanent direction="center" className="!bg-white/90">{distanceKm.toFixed(1)} km</Tooltip>}
          </Polyline>
        )}
        <CircleMarker center={[asset.lat, asset.lng]} radius={8} pathOptions={{ color: "#1f2937", fillColor: "#dc2626", fillOpacity: 0.95, weight: 1 }}>
          <Tooltip permanent direction="right">{asset.label}</Tooltip>
        </CircleMarker>
        {gauge && (
          <CircleMarker center={[gauge.lat, gauge.lng]} radius={7} pathOptions={{ color: "#1f2937", fillColor: "#2563eb", fillOpacity: 0.95, weight: 1 }}>
            <Tooltip permanent direction="left">{gauge.label}</Tooltip>
          </CircleMarker>
        )}
        <Fit pts={pts} />
      </MapContainer>
    </div>
  );
}
