"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import type { Feature, Geometry } from "geojson";
import type { DistrictShape, NationalRiver } from "@/lib/national-data";

export type MapLayer = "now" | "gaps" | "dry";

const LAYERS: { key: MapLayer; label: string; colour: string; unit: (n: number) => string }[] = [
  { key: "now", label: "Spilling now", colour: "#d7261e", unit: (n) => `${n} spilling now` },
  { key: "gaps", label: "Gaps", colour: "#A03A2B", unit: (n) => `${n.toLocaleString()} ${n === 1 ? "gap" : "gaps"}` },
  { key: "dry", label: "Dry spills", colour: "#6b4a8f", unit: (n) => `${n.toLocaleString()} dry-weather spills` },
];

const ENGLAND: L.LatLngBoundsExpression = [[49.85, -6.4], [55.85, 1.8]];
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

function riverValue(r: NationalRiver, layer: MapLayer): number {
  return layer === "now" ? r.spilling_now ?? 0 : layer === "gaps" ? r.gaps : r.dry;
}
function districtValue(d: DistrictShape, layer: MapLayer): number {
  return layer === "now" ? d.spilling_now : layer === "gaps" ? d.gaps : d.dry;
}
// Area tracks the value (radius ~ sqrt), so 26 reads about five times 1, not twenty-six.
function radius(v: number, max: number, min: number, span: number): number {
  return max > 0 && v > 0 ? min + span * Math.sqrt(v / max) : 5;
}

/** Fits the view to England or to one district whenever the level changes. */
function FitTo({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [18, 18] });
    };
    fit();
    const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
  }, [map, bounds]);
  return null;
}

/**
 * The home page map: an informational and navigational aid in two levels.
 *   England: every river basin district, covered ones shaded with one live bubble each; uncovered
 *            ones dashed. Clicking a covered district zooms in.
 *   District: each covered river as a dot sized by the chosen layer; clicking opens the river.
 * The chooser below the map is its text alternative, so nothing here is reachable only by pointer.
 */
export default function NationalMapView({
  districts,
  rivers,
  height = 540,
}: {
  districts: DistrictShape[];
  rivers: NationalRiver[];
  height?: number;
}) {
  const [layer, setLayer] = useState<MapLayer>("now");
  const [level, setLevel] = useState<string | null>(null); // null = England
  const [me, setMe] = useState<{ lat: number; lng: number; slug: string; name: string; km: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const covered = useMemo(() => districts.filter((d) => d.rivers > 0), [districts]);
  const features = useMemo(
    () =>
      districts.map((d) => ({
        d,
        feature: { type: "Feature", properties: {}, geometry: JSON.parse(d.boundary) as Geometry } as Feature<Geometry>,
      })),
    [districts],
  );
  const boundsBySlug = useMemo(() => {
    const m = new Map<string, L.LatLngBounds>();
    for (const { d, feature } of features) m.set(d.slug, L.geoJSON(feature).getBounds());
    return m;
  }, [features]);

  // A phone with a single covered district opens straight on it: at England scale on a small screen
  // the rivers would be one unreadable cluster.
  useEffect(() => {
    if (covered.length === 1 && window.matchMedia("(max-width: 639px)").matches) setLevel(covered[0].slug);
  }, [covered]);

  const active = level ? districts.find((d) => d.slug === level) ?? null : null;
  const shownRivers = rivers.filter((r) => r.lat != null && r.lng != null && (!active || r.district_slug === active.slug));
  // Zoomed in, fit to the rivers River Hub covers there (padded) rather than the whole district, which
  // can be mostly empty while coverage is partial; fall back to the district outline.
  const riverKey = shownRivers.map((r) => r.slug).join(",");
  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    if (!active) return ENGLAND;
    if (shownRivers.length > 1) return L.latLngBounds(shownRivers.map((r) => [r.lat!, r.lng!] as [number, number])).pad(0.12);
    return boundsBySlug.get(active.slug) ?? ENGLAND;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.slug, riverKey, boundsBySlug]);
  const L_ = LAYERS.find((l) => l.key === layer)!;
  const maxRiver = Math.max(0, ...shownRivers.map((r) => riverValue(r, layer)));
  const maxDistrict = Math.max(0, ...covered.map((d) => districtValue(d, layer)));

  async function nearMe() {
    if (!navigator.geolocation) {
      setLocError("Your browser can't share its location.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const res = await fetch(`/api/public/rivers-near?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}`, { cache: "no-store" });
          const body = (await res.json()) as { rivers?: { slug: string; river_name: string; distance_km: number }[]; error?: string };
          const top = body.rivers?.[0];
          if (!res.ok || !top) throw new Error(body.error ?? "No rivers found");
          const river = rivers.find((r) => r.slug === top.slug);
          setMe({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, slug: top.slug, name: top.river_name, km: top.distance_km });
          if (river?.district_slug && top.distance_km <= 25) setLevel(river.district_slug);
        } catch (e) {
          setLocError(e instanceof Error ? e.message : "Couldn't find rivers near you.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocError("Location wasn't shared.");
      },
      { maximumAge: 600000, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div role="group" aria-label="Map shows" className="flex gap-1 rounded-[6px] bg-brand-tabIdle p-1">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              type="button"
              aria-pressed={layer === l.key}
              onClick={() => setLayer(l.key)}
              className={`min-h-[34px] rounded-[4px] px-3 text-[13px] transition-colors ${focusRing} ${
                layer === l.key ? "bg-white font-semibold text-brand-navyDeep shadow-sm" : "text-brand-body hover:text-brand-navyDeep"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <button type="button" onClick={() => setLevel(null)} className={`h-10 rounded-[6px] border border-brand-line5 bg-white px-3 text-[13px] font-semibold text-brand-navyDeep hover:border-brand-navy ${focusRing}`}>
              ← England
            </button>
          )}
          {active && (
            <a href={`/d/${active.slug}`} className={`flex h-10 items-center rounded-[6px] border border-brand-line5 bg-white px-3 text-[13px] font-semibold text-brand-navyDeep hover:border-brand-navy ${focusRing}`}>
              {active.name} district page
            </a>
          )}
          <button type="button" onClick={nearMe} disabled={locating} className={`flex h-10 items-center gap-2 rounded-[6px] border border-brand-line5 bg-white px-3 text-[13px] font-semibold text-brand-navyDeep hover:border-brand-navy disabled:opacity-60 ${focusRing}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            {locating ? "Locating…" : "Near me"}
          </button>
        </div>
      </div>

      <div
        role="region"
        aria-label={`Map of England's river basin districts${active ? `, zoomed to ${active.name}` : ""}. The river list below the map has the same links.`}
        className="relative h-[400px] overflow-hidden rounded-[6px] border border-brand-line2 sm:h-[540px]"
        style={height !== 540 ? { height } : undefined}
      >
        <MapContainer bounds={ENGLAND} zoomSnap={0.25} zoomDelta={0.5} style={{ height: "100%", width: "100%", background: "#eef4f8" }} scrollWheelZoom={false} attributionControl>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.55} />
          {features.map(({ d, feature }) => {
            const isCovered = d.rivers > 0;
            const isActive = active?.slug === d.slug;
            return (
              <GeoJSON
                key={`${d.slug}-${isActive}-${!!active}`}
                data={feature}
                style={
                  {
                    color: isCovered ? "#1B4468" : "#7f97ab",
                    weight: isActive ? 2.5 : isCovered ? 1.8 : 1.2,
                    dashArray: isCovered ? undefined : "5 4",
                    fillColor: isCovered ? "#DCE7EF" : "#ffffff",
                    fillOpacity: active && !isActive ? 0.25 : isCovered ? 0.6 : 0.55,
                  } as never
                }
                eventHandlers={{ click: () => isCovered && setLevel(d.slug) }}
              >
                <Tooltip sticky>
                  <strong>{d.name}</strong>
                  <br />
                  {isCovered
                    ? `${d.rivers} ${d.rivers === 1 ? "river" : "rivers"} · ${d.spilling_now} spilling now · ${d.gaps.toLocaleString()} gaps`
                    : "Not yet covered by River Hub"}
                  {isCovered && !isActive && (
                    <>
                      <br />
                      <em>Click to zoom in</em>
                    </>
                  )}
                </Tooltip>
              </GeoJSON>
            );
          })}

          {!active &&
            covered.map((d) => {
              const v = districtValue(d, layer);
              const r = Math.max(16, radius(v, maxDistrict, 16, 14));
              return (
                <Marker
                  key={`bubble-${d.slug}-${layer}`}
                  position={[d.lat, d.lng]}
                  eventHandlers={{ click: () => setLevel(d.slug) }}
                  title={`${d.name}: ${L_.unit(v)}`}
                  alt={`${d.name}: ${L_.unit(v)}`}
                  icon={L.divIcon({
                    className: "",
                    iconSize: [r * 2, r * 2],
                    iconAnchor: [r, r],
                    html: `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${v > 0 ? L_.colour : "#1B4468"};border:3px solid #fff;box-shadow:0 2px 6px rgba(18,49,75,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${v > 999 ? 11 : 14}px 'IBM Plex Mono',monospace;cursor:pointer">${v.toLocaleString()}</div>`,
                  })}
                />
              );
            })}

          {active &&
            [...shownRivers]
              .sort((a, b) => riverValue(b, layer) - riverValue(a, layer))
              .map((r) => {
                const v = riverValue(r, layer);
                return (
                  <CircleMarker
                    key={`${r.slug}-${layer}`}
                    center={[r.lat!, r.lng!]}
                    radius={radius(v, maxRiver, 5, 14)}
                    pathOptions={{ color: "#ffffff", weight: 2, fillColor: v > 0 ? L_.colour : "#1B4468", fillOpacity: 0.88 }}
                    eventHandlers={{ click: () => { window.location.href = `/r/${r.slug}/explore/spills`; } }}
                  >
                    <Tooltip>
                      <strong>{r.river_name}</strong>
                      <br />
                      {L_.unit(v)}
                      {layer === "now" && ` of ${r.overflows} overflows`}
                      <br />
                      <em>Click to open</em>
                    </Tooltip>
                  </CircleMarker>
                );
              })}

          {me && (
            <CircleMarker center={[me.lat, me.lng]} radius={7} pathOptions={{ color: "#12314B", weight: 3, fillColor: "#ffffff", fillOpacity: 1 }}>
              <Tooltip permanent direction="top">
                You · nearest: {me.name} ({me.km} km)
              </Tooltip>
            </CircleMarker>
          )}
          <FitTo bounds={bounds} />
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-1.5 rounded-[6px] bg-white/95 px-3 py-2 text-[12px] text-brand-body">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: L_.colour }} />
            {active ? `Each river, sized by ${L_.label.toLowerCase()}` : `${L_.label} per district`}
          </span>
          {!active && (
            <>
              <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-3.5 border-[1.5px] border-brand-navy bg-[#DCE7EF]" />Covered district</span>
              <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-3.5 border-[1.5px] border-dashed border-[#9fb2c2] bg-[#F7F9FB]" />Not yet covered</span>
            </>
          )}
        </div>
      </div>
      {locError && <p role="status" className="text-[13px] font-semibold text-rh-alarm">{locError} Try the postcode search in the river list below.</p>}
    </div>
  );
}
