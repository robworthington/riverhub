"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import { useEffect } from "react";
import type { Feature, Geometry } from "geojson";
import { CLASS_COLOUR, type BathingClass } from "@/lib/bathing";
import { INSTANCE } from "@/lib/instance";

export interface AreaMapSite { id: string; name: string; lat: number; lng: number; klass: BathingClass }
export interface AreaMapAsset { id: string; name: string; lat: number; lng: number; status: number | null }

function assetColour(status: number | null): string {
  if (status === 1) return "#dc2626";
  if (status === 0) return "#16a34a";
  if (status === -1) return "#d97706";
  return "#9ca3af";
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
    for (const p of pts) {
      bounds = bounds ? bounds.extend(p) : L.latLngBounds(p, p);
    }
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, feature, pts]);
  return null;
}

export default function AreaMapView({
  boundary,
  sites,
  assets,
  height = "420px",
  linkBase = "",
  publicMode = false,
}: {
  boundary: string | null;
  sites: AreaMapSite[];
  assets: AreaMapAsset[];
  height?: string;
  linkBase?: string;
  // public portal has no per-asset page, so suppress the asset deep-link there
  publicMode?: boolean;
}) {
  const feature: Feature<Geometry> | null = boundary
    ? { type: "Feature", properties: {}, geometry: JSON.parse(boundary) as Geometry }
    : null;
  const pts: [number, number][] = [...sites, ...assets].map((m) => [m.lat, m.lng]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {feature && (
          <GeoJSON data={feature} style={{ color: "#176577", weight: 2, fillColor: "#1d7c8c", fillOpacity: 0.08 } as never} />
        )}
        {sites.map((s) => (
          <CircleMarker
            key={`site-${s.id}`}
            center={[s.lat, s.lng]}
            radius={6}
            pathOptions={{ color: "#176577", fillColor: s.klass !== "Insufficient data" ? CLASS_COLOUR[s.klass] : "#1d7c8c", fillOpacity: 0.9 }}
          >
            <Popup>
              <strong>{s.name}</strong><br />
              <span className="text-xs">Site{s.klass !== "Insufficient data" ? ` — ${s.klass}` : ""}</span><br />
              <Link href={`${linkBase}/sites/${s.id}`}>Open site →</Link>
            </Popup>
          </CircleMarker>
        ))}
        {assets.map((a) => (
          <CircleMarker
            key={`asset-${a.id}`}
            center={[a.lat, a.lng]}
            radius={7}
            pathOptions={{ color: "#1f2937", fillColor: assetColour(a.status), fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <strong>{a.name}</strong><br />
              <span className="text-xs">Sewage asset</span>
              {!publicMode && (
                <>
                  <br />
                  <Link href={`${linkBase}/assets/${a.id}`}>Open asset →</Link>
                </>
              )}
            </Popup>
          </CircleMarker>
        ))}
        <FitBounds feature={feature} pts={pts} />
      </MapContainer>
    </div>
  );
}
