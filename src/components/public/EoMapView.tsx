"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { INSTANCE } from "@/lib/instance";
import { type EoRow, fmtHours, eoDisplayName } from "@/lib/emergencyOverflows";

// Radius + colour scale with total recorded hours — an EO that fired for hundreds of hours reads big and red.
function marker(total: number): { radius: number; fill: string } {
  if (total >= 500) return { radius: 12, fill: "#b8342a" };
  if (total >= 100) return { radius: 9, fill: "#9a4415" };
  if (total >= 10) return { radius: 7, fill: "#c07a12" };
  if (total > 0) return { radius: 6, fill: "#0d6b62" };
  return { radius: 5, fill: "#7d8a8c" };
}

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 13);
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
  }, [map, pts]);
  return null;
}

export default function EoMapView({ rows, height = "62vh" }: { rows: EoRow[]; height?: string }) {
  const pinned = rows.filter((r) => r.lat != null && r.lng != null);
  const pts: [number, number][] = pinned.map((r) => [r.lat as number, r.lng as number]);
  // draw the worst last so they sit on top
  const ordered = [...pinned].sort((a, b) => a.total_hours - b.total_hours);

  return (
    <div className="w-full overflow-hidden rounded-[3px] border border-rh-line" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds pts={pts} />
        {ordered.map((r) => {
          const m = marker(r.total_hours);
          return (
            <CircleMarker
              key={r.id}
              center={[r.lat as number, r.lng as number]}
              radius={m.radius}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: m.fill, fillOpacity: 0.95 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-plexmono text-[11px]">{eoDisplayName(r.overflow_name)}</span>
              </Tooltip>
              <Popup>
                <div className="space-y-1">
                  <div className="text-[13px] font-semibold">{eoDisplayName(r.overflow_name)}</div>
                  <div className="text-[12px] text-gray-600">
                    {fmtHours(r.total_hours)} hours recorded since monitoring began
                    {r.worst_year ? ` · worst ${r.worst_year}: ${fmtHours(r.worst_hours)}h` : ""}
                  </div>
                  {r.system_name && <div className="text-[11.5px] text-gray-500">Drains to {r.system_name} works</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
