"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import { RiverLink } from "@/components/public/RiverLink";
import { useEffect } from "react";
import { INSTANCE } from "@/lib/instance";
import { dryFlagTitle, preStwFlagTitle, type LiveStatus } from "@/lib/spillStatus";
import { Chip } from "@/components/public/Chip";
import { LIVE_LABEL, LIVE_MARKER } from "@/lib/liveMarker";

export interface SpillPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  live: LiveStatus;
  dry?: number; // dry-weather spills, all years (for the flag chips)
  preStw?: number; // spills ahead of the works, all years
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

export default function SpillMapView({ pins, height = "70vh" }: { pins: SpillPin[]; height?: string }) {
  const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
  // draw the most urgent pins last so they sit on top
  const RANK = { nodata: 0, ok: 1, recent: 2, spilling: 3 } as const;
  const ordered = [...pins].sort((a, b) => RANK[a.live] - RANK[b.live]);

  return (
    <div className="w-full overflow-hidden rounded-[3px] border border-rh-line" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds pts={pts} />
        {/* halos under every spilling-now pin. className must be a top-level prop: react-leaflet
            applies pathOptions through setStyle, which ignores className (why the old pulse never ran). */}
        {pins.filter((p) => p.live === "spilling").map((p) => (
          <CircleMarker
            key={`halo-${p.id}`}
            center={[p.lat, p.lng]}
            radius={LIVE_MARKER.spilling.radius}
            interactive={false}
            className="rh-map-ping"
            pathOptions={{ stroke: false, fillColor: LIVE_MARKER.spilling.fill, fillOpacity: 1 }}
          />
        ))}
        {ordered.map((p) => {
          const s = LIVE_MARKER[p.live];
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={s.radius}
              pathOptions={{ color: s.ring, weight: s.weight, fillColor: s.fill, fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-plexmono text-[11px]">{p.name}</span>
              </Tooltip>
              <Popup>
                <div className="space-y-1">
                  <div className="text-[13px] font-semibold">{p.name}</div>
                  <div className="text-[12px] text-gray-600">
                    {LIVE_LABEL[p.live]}
                  </div>
                  {(p.dry || p.preStw) ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {p.dry ? <Chip variant="dry" title={dryFlagTitle(p.dry, "all years")}>Dry {p.dry}</Chip> : null}
                      {p.preStw ? <Chip variant="prestw" title={preStwFlagTitle(p.preStw, "all years")}>Pre-STW {p.preStw}</Chip> : null}
                    </div>
                  ) : null}
                  <RiverLink href={`/explore/spills/${p.id}`} className="text-[12.5px] font-semibold text-rh-teal underline">See history →</RiverLink>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
