"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import Link from "next/link";
import { CLASS_COLOUR, type BathingClass } from "@/lib/bathing";
import { INSTANCE } from "@/lib/instance";

export interface MapSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  klass?: BathingClass | null;
}
export interface MapAsset {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: number | null;
}
export interface MapEaSite {
  notation: string;
  name: string;
  lat: number;
  lng: number;
  samples?: number | null;
  wb?: string | null;
}

function assetColour(status: number | null): string {
  if (status === 1) return "#dc2626"; // spilling — red
  if (status === 0) return "#16a34a"; // not spilling — green
  if (status === -1) return "#d97706"; // offline — amber
  return "#9ca3af"; // unknown — grey
}

export default function MapView({
  sites,
  assets,
  eaSites = [],
  height = "70vh",
  zoom = 11,
}: {
  sites: MapSite[];
  assets: MapAsset[];
  eaSites?: MapEaSite[];
  height?: string;
  zoom?: number;
}) {
  const pts = [...sites, ...assets, ...eaSites];
  const center: [number, number] = pts.length
    ? [
        pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      ]
    : [...INSTANCE.mapCentre]; // catchment fallback before any data exists

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200" style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((s) => {
          const fill = s.klass && s.klass !== "Insufficient data" ? CLASS_COLOUR[s.klass] : "#1d7c8c";
          return (
            <CircleMarker
              key={`site-${s.id}`}
              center={[s.lat, s.lng]}
              radius={7}
              pathOptions={{ color: "#176577", fillColor: fill, fillOpacity: 0.9 }}
            >
              <Popup>
                <strong>{s.name}</strong>
                <br />
                <span className="text-xs">
                  Testing site{s.klass && s.klass !== "Insufficient data" ? ` — ${s.klass}` : ""}
                </span>
                <br />
                <Link href={`/sites/${s.id}`}>Open site →</Link>
              </Popup>
            </CircleMarker>
          );
        })}
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
        {eaSites.map((e) => (
          <CircleMarker
            key={`ea-${e.notation}`}
            center={[e.lat, e.lng]}
            radius={6}
            pathOptions={{ color: "#4338ca", fillColor: "#6366f1", fillOpacity: 0.85, weight: 1 }}
          >
            <Popup>
              <strong>{e.name}</strong>
              <br />
              <span className="text-xs">
                EA monitoring point{e.wb ? ` — ${e.wb}` : ""}{e.samples != null ? ` · ${e.samples} samples` : ""}
              </span>
              <br />
              <Link href={`/explore/ea-monitoring/${encodeURIComponent(e.notation)}`}>Open EA site →</Link>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
