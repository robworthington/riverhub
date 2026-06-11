"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer } from "leaflet";
import { INSTANCE } from "@/lib/instance";

export interface ParishProps {
  name: string;
  mean: number;
  n: number;
}

function colour(mean: number): string {
  if (mean <= 250) return "#16a34a"; // excellent
  if (mean <= 500) return "#d97706"; // good
  return "#dc2626"; // poor
}

export default function ChoroplethMap({ data }: { data: FeatureCollection }) {
  const feats = data.features as Feature<Geometry, ParishProps>[];
  const center: [number, number] = [...INSTANCE.mapCentre];

  function style(feature?: Feature<Geometry, ParishProps>) {
    const mean = feature?.properties?.mean ?? 0;
    return { fillColor: colour(mean), weight: 1, color: "#374151", fillOpacity: 0.6 };
  }

  function onEach(feature: Feature<Geometry, ParishProps>, layer: Layer) {
    const p = feature.properties;
    layer.bindTooltip(`${p.name}: mean ${p.mean} (n=${p.n})`, { sticky: true });
  }

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {feats.length > 0 && (
          <GeoJSON
            key={feats.map((f) => `${f.properties.name}:${f.properties.mean}`).join("|")}
            data={data}
            style={style as never}
            onEachFeature={onEach as never}
          />
        )}
      </MapContainer>
    </div>
  );
}
