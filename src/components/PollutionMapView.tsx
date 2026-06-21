"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, LayersControl, LayerGroup } from "react-leaflet";
import Link from "next/link";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer } from "leaflet";
import { INSTANCE } from "@/lib/instance";

export interface SitePin { id: string; name: string; lat: number; lng: number; tidal: boolean; n: number; median: number; colour?: string | null }
export interface EaPin { notation: string; name: string; lat: number; lng: number; n: number; wb?: string | null }

// EA bathing-water bands — coastal/transitional vs inland (freshwater) differ.
export function bandColour(value: number, tidal: boolean): string {
  const t1 = tidal ? 250 : 500; // Excellent boundary
  const t2 = tidal ? 500 : 1000; // Good boundary
  if (value <= t1) return "#16a34a"; // green
  if (value <= t2) return "#d97706"; // amber
  return "#dc2626"; // red
}

interface AreaProps { name: string; n: number; min: number | null; max: number | null; mean: number | null; median: number | null; tidal: boolean; colour?: string | null }
interface RiverProps { name: string | null; n: number; median: number; tidal: boolean; nearest: string | null }

const NO_DATA = "#cbd5e1"; // slate-300

export default function PollutionMapView({
  districts,
  parishes,
  rivers,
  sites,
  eaSites = [],
  linkBase = "",
  unit = "CFU/100mL",
  siteHrefPrefix,
}: {
  districts: FeatureCollection;
  parishes: FeatureCollection;
  rivers: FeatureCollection;
  sites: SitePin[];
  eaSites?: EaPin[];
  linkBase?: string;
  unit?: string;
  siteHrefPrefix?: string;
}) {
  const sitePrefix = siteHrefPrefix ?? `${linkBase}/sites/`;
  const areaTooltip = (p: AreaProps): string =>
    !p.n || p.median == null
      ? `<strong>${p.name}</strong><br/>no samples`
      : `<strong>${p.name}</strong><br/>median ${p.median} · mean ${p.mean}<br/>range ${p.min}–${p.max} · n=${p.n} ${unit}`;

  function areaStyle(feature?: Feature<Geometry, AreaProps>) {
    const p = feature?.properties;
    const hasData = p && p.n > 0 && p.median != null;
    return {
      fillColor: p?.colour ?? (hasData ? bandColour(p!.median!, p!.tidal) : NO_DATA),
      weight: 1,
      color: "#374151",
      fillOpacity: hasData ? 0.55 : 0.25,
    };
  }
  function onEachArea(feature: Feature<Geometry, AreaProps>, layer: Layer) {
    if (feature.properties) layer.bindTooltip(areaTooltip(feature.properties), { sticky: true });
  }
  function riverStyle(feature?: Feature<Geometry, RiverProps>) {
    const p = feature?.properties;
    return { color: p ? bandColour(p.median, p.tidal) : "#60a5fa", weight: 4, opacity: 0.9 };
  }
  function onEachRiver(feature: Feature<Geometry, RiverProps>, layer: Layer) {
    const p = feature.properties;
    if (p) layer.bindTooltip(`<strong>${p.name ?? "watercourse"}</strong><br/>median ${p.median} ${unit} (n=${p.n})<br/>nearest: ${p.nearest ?? "—"}`, { sticky: true });
  }

  return (
    <div className="h-[72vh] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={INSTANCE.mapCentre} zoom={INSTANCE.mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LayersControl position="topright" collapsed={false}>
          <LayersControl.Overlay name="Districts (median)">
            <GeoJSON key="d" data={districts} style={areaStyle as never} onEachFeature={onEachArea as never} />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Parishes (median)">
            <GeoJSON key="p" data={parishes} style={areaStyle as never} onEachFeature={onEachArea as never} />
          </LayersControl.Overlay>
          {rivers.features.length > 0 && (
            <LayersControl.Overlay checked name="River stretches">
              <GeoJSON key="r" data={rivers} style={riverStyle as never} onEachFeature={onEachRiver as never} />
            </LayersControl.Overlay>
          )}
          <LayersControl.Overlay checked name="Sampling sites">
            <SitesLayer sites={sites} sitePrefix={sitePrefix} unit={unit} />
          </LayersControl.Overlay>
          {eaSites.length > 0 && (
            <LayersControl.Overlay checked name="EA monitoring points">
              <LayerGroup>
                {eaSites.map((e) => (
                  <CircleMarker
                    key={`ea-${e.notation}`}
                    center={[e.lat, e.lng]}
                    radius={5}
                    pathOptions={{ color: "#4338ca", weight: 1, fillColor: "#6366f1", fillOpacity: 0.85 }}
                  >
                    <Popup>
                      <strong>{e.name}</strong>
                      <br />
                      <span className="text-xs">EA monitoring point{e.wb ? ` — ${e.wb}` : ""} · {e.n} samples</span>
                      <br />
                      <Link href={`/explore/ea-monitoring/${encodeURIComponent(e.notation)}`}>Open EA site →</Link>
                    </Popup>
                  </CircleMarker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>
          )}
        </LayersControl>
      </MapContainer>
    </div>
  );
}

function SitesLayer({ sites, sitePrefix, unit }: { sites: SitePin[]; sitePrefix: string; unit: string }) {
  return (
    <LayerGroup>
      {sites.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={6}
          pathOptions={{ color: "#1f2937", weight: 1, fillColor: s.colour ?? bandColour(s.median, s.tidal), fillOpacity: 0.95 }}
        >
          <Popup>
            <strong>{s.name}</strong>
            <br />
            <span className="text-xs">
              median {s.median} {unit} (n={s.n})
            </span>
            <br />
            <Link href={`${sitePrefix}${encodeURIComponent(s.id)}`}>Open →</Link>
          </Popup>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
