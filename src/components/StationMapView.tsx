"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import { useEffect } from "react";
import { INSTANCE } from "@/lib/instance";

export interface MapStation { id: string; name: string; lat: number; lng: number }
export interface MapStationAsset { id: string; name: string; lat: number; lng: number }

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView(pts[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [25, 25] });
  }, [map, pts]);
  return null;
}

export default function StationMapView({
  stations,
  assets = [],
  height = "420px",
}: {
  stations: MapStation[];
  assets?: MapStationAsset[];
  height?: string;
}) {
  const pts: [number, number][] = [...stations, ...assets].map((m) => [m.lat, m.lng]);
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {assets.map((a) => (
          <CircleMarker
            key={`asset-${a.id}`}
            center={[a.lat, a.lng]}
            radius={5}
            pathOptions={{ color: "#1f2937", fillColor: "#9ca3af", fillOpacity: 0.85, weight: 1 }}
          >
            <Popup>
              <strong>{a.name}</strong><br /><span className="text-xs">Linked asset</span><br />
              <Link href={`/assets/${a.id}`}>Open asset →</Link>
            </Popup>
          </CircleMarker>
        ))}
        {stations.map((s) => (
          <CircleMarker
            key={`station-${s.id}`}
            center={[s.lat, s.lng]}
            radius={8}
            pathOptions={{ color: "#1e3a8a", fillColor: "#2563eb", fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <strong>{s.name}</strong><br /><span className="text-xs">Rainfall station</span><br />
              <Link href={`/rainfall-stations/${s.id}`}>Open station →</Link>
            </Popup>
          </CircleMarker>
        ))}
        <FitBounds pts={pts} />
      </MapContainer>
    </div>
  );
}
