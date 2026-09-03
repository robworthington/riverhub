"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import { useEffect } from "react";
import { INSTANCE } from "@/lib/instance";
import { dryFlagTitle, preStwFlagTitle, type LiveStatus } from "@/lib/spillStatus";
import { Chip } from "@/components/public/Chip";

export interface SpillPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  live: LiveStatus;
  dry?: number; // dry-weather spills, all years (for the flag chips)
  preStw?: number; // spills ahead of the works, all years
}

// fill (dot) + ring colour per status. nodata reads as a hollow dot with a grey ring.
const STYLE: Record<LiveStatus, { fill: string; ring: string; fillOpacity: number }> = {
  spilling: { fill: "#b8342a", ring: "#ffffff", fillOpacity: 1 },
  recent: { fill: "#c07a12", ring: "#ffffff", fillOpacity: 1 },
  ok: { fill: "#0d6b62", ring: "#ffffff", fillOpacity: 1 },
  nodata: { fill: "#ffffff", ring: "#7d8a8c", fillOpacity: 1 },
};

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 13);
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
  }, [map, pts]);
  return null;
}

export default function SpillMapView({ pins, height = "70vh" }: { pins: SpillPin[]; height?: string }) {
  const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
  // draw spilling pins last so they sit on top
  const ordered = [...pins].sort((a, b) => (a.live === "spilling" ? 1 : 0) - (b.live === "spilling" ? 1 : 0));

  return (
    <div className="w-full overflow-hidden rounded-[3px] border border-rh-line" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds pts={pts} />
        {ordered.map((p) => {
          const s = STYLE[p.live];
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={7}
              pathOptions={{ color: s.ring, weight: 2.5, fillColor: s.fill, fillOpacity: s.fillOpacity, className: p.live === "spilling" ? "animate-rh-pulse" : undefined }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-plexmono text-[11px]">{p.name}</span>
              </Tooltip>
              <Popup>
                <div className="space-y-1">
                  <div className="text-[13px] font-semibold">{p.name}</div>
                  <div className="text-[12px] capitalize text-gray-600">
                    {p.live === "ok" ? "Not spilling" : p.live === "recent" ? "Spilled in last 48h" : p.live === "spilling" ? "Spilling now" : "No data from feed"}
                  </div>
                  {(p.dry || p.preStw) ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {p.dry ? <Chip variant="dry" title={dryFlagTitle(p.dry, "all years")}>Dry {p.dry}</Chip> : null}
                      {p.preStw ? <Chip variant="prestw" title={preStwFlagTitle(p.preStw, "all years")}>Pre-STW {p.preStw}</Chip> : null}
                    </div>
                  ) : null}
                  <Link href={`/explore/spills/${p.id}`} className="text-[12.5px] font-semibold text-rh-teal underline">See history →</Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
