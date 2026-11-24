"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Marker, Pane, Tooltip, Popup, useMap } from "react-leaflet";
import { RiverLink } from "@/components/public/RiverLink";
import { useEffect, useMemo, useState } from "react";
import { INSTANCE } from "@/lib/instance";
import { dryFlagTitle, preStwFlagTitle, type LiveStatus } from "@/lib/spillStatus";
import { Chip } from "@/components/public/Chip";
import { LIVE_LABEL, LIVE_MARKER } from "@/lib/liveMarker";
import { overflowLabel } from "@/lib/overflowNames";
import { wdtkNewRequestUrl } from "@/lib/requests";
import {
  type PublicIncident, SEWAGE_POLLUTANT_EXPLAIN, SEWAGE_POLLUTANT_LABEL, fmtIncidentDate, impactText, incidentReportRequest,
} from "@/lib/incidents";

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

// Serious sewage pollution incidents (EA, category 1 and 2) draw as navy diamonds, so they never
// read as an overflow's live status; major ones are larger. They sit in a pane under the overflow
// pins, so a pin is always clickable.
const incidentIcon = (category: number) => {
  const size = category === 1 ? 17 : 12;
  return L.divIcon({
    className: "",
    html: `<span class="rh-inc${category === 1 ? " rh-inc-major" : ""}" style="width:${size}px;height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

function IncidentPopup({ i, riverName, riverSlug }: { i: PublicIncident; riverName: string; riverSlug: string }) {
  const near = i.asset_name ? overflowLabel(i.asset_name, i.asset_type) : null;
  const req = incidentReportRequest(i, riverName);
  const ask = wdtkNewRequestUrl({ authoritySlug: "environment_agency", title: req.title, letter: req.letter, riverSlug });
  return (
    <div className="max-w-[260px] space-y-1.5">
      <div className="text-[13px] font-semibold">Sewage pollution incident</div>
      <div className="font-plexmono text-[11.5px] text-gray-600">
        {fmtIncidentDate(i.occurred_on)}{i.occurred_time ? `, ${i.occurred_time}` : ""} · EA ref {i.not_id}
      </div>
      <div className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${i.category === 1 ? "border-[#e8b6ae] bg-rh-alarmTint text-rh-alarmDeep" : "border-rh-chipAmberBorder bg-rh-chipAmberBg text-rh-amber"}`}>
        {impactText(i)}
      </div>
      <ul className="space-y-0.5 text-[12px] text-gray-700">
        {(i.pollutants.length ? i.pollutants : ["Other Sewage Material"]).map((p) => (
          <li key={p}><strong>{SEWAGE_POLLUTANT_LABEL[p] ?? p}</strong>{SEWAGE_POLLUTANT_EXPLAIN[p] ? `: ${SEWAGE_POLLUTANT_EXPLAIN[p]}` : ""}</li>
        ))}
      </ul>
      {near && i.asset_id && (
        <div className="text-[12px] text-gray-700">
          {i.distance_m != null && i.distance_m <= 30 ? "At " : `About ${i.distance_m} m from `}
          <RiverLink href={`/explore/spills/${i.asset_id}`} className="font-semibold text-rh-teal underline">{near}</RiverLink>
        </div>
      )}
      <a href={ask} target="_blank" rel="noopener noreferrer" className="block text-[12px] font-semibold text-brand-navy underline">
        Ask the EA for the full report ↗
      </a>
      <div className="text-[10.5px] leading-snug text-gray-500">
        The EA records where an incident happened, not who caused it. Being near an overflow is not a finding that it was responsible.
      </div>
    </div>
  );
}

export default function SpillMapView({
  pins, incidents = [], riverName = "", riverSlug = "", height = "70vh", incidentsOn = false,
}: { pins: SpillPin[]; incidents?: PublicIncident[]; riverName?: string; riverSlug?: string; height?: string; incidentsOn?: boolean }) {
  const [showIncidents, setShowIncidents] = useState(incidentsOn);
  const major = incidents.filter((i) => i.category === 1).length;
  // memoised so toggling the incident layer doesn't re-fit the map
  const pts = useMemo<[number, number][]>(() => pins.map((p) => [p.lat, p.lng]), [pins]);
  // draw the most urgent pins last so they sit on top
  const RANK = { nodata: 0, ok: 1, recent: 2, spilling: 3 } as const;
  const ordered = [...pins].sort((a, b) => RANK[a.live] - RANK[b.live]);

  return (
    <div className="space-y-2">
    {incidents.length > 0 && (
      <label className="flex w-fit cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border border-rh-line bg-rh-card px-3 py-2 text-[13px] text-rh-ink">
        <input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} className="h-4 w-4 accent-brand-navy" />
        <span aria-hidden className="rh-inc ml-1" style={{ width: 11, height: 11 }} />
        <span>
          Show serious sewage pollution incidents <span className="text-rh-ink3">({incidents.length} since {incidents.reduce((m, i) => (i.occurred_on < m ? i.occurred_on : m), incidents[0].occurred_on).slice(0, 4)}{major ? `, ${major} major` : ""})</span>
        </span>
      </label>
    )}
    <div className="w-full overflow-hidden rounded-[3px] border border-rh-line" style={{ height }}>
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds pts={pts} />
        {showIncidents && (
          <Pane name="incidents" style={{ zIndex: 390 }}>
            {incidents.map((i) => (
              <Marker key={i.not_id} position={[i.lat, i.lng]} icon={incidentIcon(i.category)} pane="incidents">
                {/* inside <Pane> these would inherit the low incidents pane and open under the pins */}
                <Tooltip direction="top" offset={[0, -6]} pane="tooltipPane">
                  <span className="font-plexmono text-[11px]">Incident · {fmtIncidentDate(i.occurred_on)}</span>
                </Tooltip>
                <Popup pane="popupPane">
                  <IncidentPopup i={i} riverName={riverName} riverSlug={riverSlug} />
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
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
    </div>
  );
}
