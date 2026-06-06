"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import Link from "next/link";

export interface MapSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
}
export interface MapAsset {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: number | null;
}

function assetColour(status: number | null): string {
  if (status === 1) return "#dc2626"; // spilling — red
  if (status === 0) return "#16a34a"; // not spilling — green
  if (status === -1) return "#d97706"; // offline — amber
  return "#9ca3af"; // unknown — grey
}

export default function MapView({ sites, assets }: { sites: MapSite[]; assets: MapAsset[] }) {
  const pts = [...sites, ...assets];
  const center: [number, number] = pts.length
    ? [
        pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      ]
    : [50.43, -3.7]; // Dart catchment fallback

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((s) => (
          <CircleMarker
            key={`site-${s.id}`}
            center={[s.lat, s.lng]}
            radius={7}
            pathOptions={{ color: "#176577", fillColor: "#1d7c8c", fillOpacity: 0.9 }}
          >
            <Popup>
              <strong>{s.name}</strong>
              <br />
              <span className="text-xs">Testing site</span>
              <br />
              <Link href={`/sites/${s.id}`}>Open site →</Link>
            </Popup>
          </CircleMarker>
        ))}
        {assets.map((a) => (
          <CircleMarker
            key={`asset-${a.id}`}
            center={[a.lat, a.lng]}
            radius={8}
            pathOptions={{ color: "#1f2937", fillColor: assetColour(a.status), fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <strong>{a.name}</strong>
              <br />
              <span className="text-xs">
                Sewage asset —{" "}
                {a.status === 1 ? "Spilling" : a.status === 0 ? "Not spilling" : a.status === -1 ? "Monitor offline" : "No data"}
              </span>
              <br />
              <Link href={`/assets/${a.id}`}>Open asset →</Link>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
