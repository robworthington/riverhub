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
import {
  BANDS, BAND_META, TEST_META, fmt, isSquare, periodLabel, siteName, type Band, type TestKey, type WqMap, type WqMapPoint,
} from "@/lib/riverHealth";
import { askedText, asksByTopic, incidentTopic, type PublicAsk } from "@/lib/wdtkTopics";

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

function IncidentPopup({ i, riverName, riverSlug, asked }: { i: PublicIncident; riverName: string; riverSlug: string; asked?: PublicAsk }) {
  const near = i.asset_name ? overflowLabel(i.asset_name, i.asset_type) : null;
  const req = incidentReportRequest(i, riverName);
  const ask = wdtkNewRequestUrl({ authoritySlug: "environment_agency", title: req.title, letter: req.letter, riverSlug, topic: incidentTopic(i.not_id) });
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
      {asked ? (
        // someone has already asked for this report: follow that request instead of sending another
        <a href={asked.url} target="_blank" rel="noopener noreferrer" className="block text-[12px] font-semibold text-brand-navy underline">
          Report requested: {askedText(asked)} ↗
        </a>
      ) : (
        <a href={ask} target="_blank" rel="noopener noreferrer" className="block text-[12px] font-semibold text-brand-navy underline">
          Ask the EA for the full report ↗
        </a>
      )}
      <div className="text-[10.5px] leading-snug text-gray-500">
        The EA records where an incident happened, not who caused it. Being near an overflow is not a finding that it was responsible.
      </div>
    </div>
  );
}

// EA water-quality sampling points: a dot per point in its band colour for the chosen test, poor and
// bad as squares (so the worst stand out without colour), too few tests to band as a hollow ring.
const wqIcon = (band: Band | null) => {
  const size = band ? 14 : 11;
  const style = band
    ? `background:${BAND_META[band].bg};border:2px solid #fff;border-radius:${isSquare(band) ? "3px" : "50%"};box-shadow:0 0 0 1px rgba(16,27,29,.35)`
    : "background:#fff;border:2px solid #7d8b8d;border-radius:50%";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;box-sizing:border-box;width:${size}px;height:${size}px;${style}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const WQ_TESTS: TestKey[] = ["phosphate", "ammonia", "oxygen"];

function WqPopup({ p, period }: { p: WqMapPoint; period: string }) {
  const n = Math.max(0, ...Object.values(p.tests).map((t) => t?.n ?? 0));
  return (
    <div className="min-w-[220px] max-w-[260px] space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-gray-500">EA sampling point</div>
      <div className="text-[13.5px] font-semibold leading-snug">{siteName(p.site_label)}</div>
      <div className="text-[11.5px] text-gray-600">Up to {n} tests in {period} · latest {p.latest}</div>
      <dl className="divide-y divide-gray-100 text-[12.5px]">
        {WQ_TESTS.map((k) => {
          const t = p.tests[k];
          return (
            <div key={k} className="flex items-baseline justify-between gap-3 py-1">
              <dt>{TEST_META[k].title}</dt>
              <dd className="font-plexmono text-[12px]" style={{ color: t?.band ? BAND_META[t.band].text : "#5b6a6c" }}>
                {t ? `${fmt(k, t.mean)} · ${t.band ? BAND_META[t.band].label : `${t.n} tests, too few to band`}` : "not tested"}
              </dd>
            </div>
          );
        })}
      </dl>
      <RiverLink href={`/explore/ea-monitoring/${encodeURIComponent(p.notation)}`} className="block text-[12.5px] font-semibold text-rh-teal underline">
        Open full history →
      </RiverLink>
    </div>
  );
}

export default function SpillMapView({
  pins, incidents = [], wq, asks = [], riverName = "", riverSlug = "", height = "70vh", incidentsOn = false,
}: { pins: SpillPin[]; incidents?: PublicIncident[]; wq?: WqMap | null; asks?: PublicAsk[]; riverName?: string; riverSlug?: string; height?: string; incidentsOn?: boolean }) {
  const askMap = useMemo(() => asksByTopic(asks), [asks]);
  const [showIncidents, setShowIncidents] = useState(incidentsOn);
  const [showPins, setShowPins] = useState(true);
  const [showWq, setShowWq] = useState(false);
  const [wqTest, setWqTest] = useState<TestKey>("phosphate");
  const wqPoints = useMemo(() => wq?.points ?? [], [wq]);
  // the River health page links here as #water-quality: open on that layer
  useEffect(() => {
    if (window.location.hash === "#water-quality" && wqPoints.length) {
      setShowWq(true);
      setShowPins(false);
    }
  }, [wqPoints.length]);
  const major = incidents.filter((i) => i.category === 1).length;
  // memoised so toggling a layer doesn't re-fit the map; falls back to the sampling points
  const pts = useMemo<[number, number][]>(
    () => (pins.length ? pins.map((p) => [p.lat, p.lng]) : wqPoints.map((p) => [p.lat, p.lng])),
    [pins, wqPoints],
  );
  // draw the most urgent pins last so they sit on top
  const RANK = { nodata: 0, ok: 1, recent: 2, spilling: 3 } as const;
  const ordered = [...pins].sort((a, b) => RANK[a.live] - RANK[b.live]);
  // worst bands drawn last (on top); unbanded first
  const wqOrdered = useMemo(() => {
    const r = (p: WqMapPoint) => { const b = p.tests[wqTest]?.band; return b ? BANDS.indexOf(b) + 1 : 0; };
    return wqPoints.filter((p) => p.tests[wqTest]).sort((a, b) => r(a) - r(b));
  }, [wqPoints, wqTest]);
  const period = periodLabel(wq?.from_year ?? null, wq?.year ?? null);
  const layerCls = "flex cursor-pointer items-center gap-2 rounded-[3px] border border-rh-line bg-rh-card px-3 py-2 text-[13px] text-rh-ink";

  return (
    <div className="space-y-2">
    {(incidents.length > 0 || wqPoints.length > 0) && (
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Map layers</legend>
        <label className={layerCls}>
          <input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} className="h-4 w-4 accent-brand-navy" />
          Storm overflows
        </label>
        {wqPoints.length > 0 && (
          <label className={layerCls}>
            <input type="checkbox" checked={showWq} onChange={(e) => setShowWq(e.target.checked)} className="h-4 w-4 accent-brand-navy" />
            EA water quality <span className="text-rh-ink3">({wqPoints.length} sampling points)</span>
          </label>
        )}
        {incidents.length > 0 && (
          <label className={`${layerCls} flex-wrap`}>
            <input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} className="h-4 w-4 accent-brand-navy" />
            <span aria-hidden className="rh-inc" style={{ width: 11, height: 11 }} />
            <span>
              Serious sewage pollution incidents <span className="text-rh-ink3">({incidents.length} since {incidents.reduce((m, i) => (i.occurred_on < m ? i.occurred_on : m), incidents[0].occurred_on).slice(0, 4)}{major ? `, ${major} major` : ""})</span>
            </span>
          </label>
        )}
        {showWq && (
          <label className="flex items-center gap-2 text-[13px] text-rh-ink2">
            Colour by
            <select value={wqTest} onChange={(e) => setWqTest(e.target.value as TestKey)} className="rounded-[3px] border border-rh-line bg-white px-2 py-2 text-[13px] text-rh-ink">
              {WQ_TESTS.map((k) => <option key={k} value={k}>{TEST_META[k].title}</option>)}
            </select>
          </label>
        )}
      </fieldset>
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
                  <IncidentPopup i={i} riverName={riverName} riverSlug={riverSlug} asked={askMap.get(incidentTopic(i.not_id))} />
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
        {showWq && (
          <Pane name="wq" style={{ zIndex: 395 }}>
            {wqOrdered.map((p) => (
              <Marker
                key={`${wqTest}-${p.notation}`}
                position={[p.lat, p.lng]}
                icon={wqIcon(p.tests[wqTest]?.band ?? null)}
                pane="wq"
                title={siteName(p.site_label)}
              >
                <Tooltip direction="top" offset={[0, -6]} pane="tooltipPane">
                  <span className="font-plexmono text-[11px]">{siteName(p.site_label)}</span>
                </Tooltip>
                <Popup pane="popupPane">
                  <WqPopup p={p} period={period} />
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
        {/* halos under every spilling-now pin. className must be a top-level prop: react-leaflet
            applies pathOptions through setStyle, which ignores className (why the old pulse never ran). */}
        {showPins && pins.filter((p) => p.live === "spilling").map((p) => (
          <CircleMarker
            key={`halo-${p.id}`}
            center={[p.lat, p.lng]}
            radius={LIVE_MARKER.spilling.radius}
            interactive={false}
            className="rh-map-ping"
            pathOptions={{ stroke: false, fillColor: LIVE_MARKER.spilling.fill, fillOpacity: 1 }}
          />
        ))}
        {showPins && ordered.map((p) => {
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
    {showWq && (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-rh-ink2">
        <strong className="font-semibold text-rh-ink">{TEST_META[wqTest].title}, average {period}</strong>
        {BANDS.map((b) => (
          <span key={b} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 border-2 border-white shadow-[0_0_0_1px_rgba(16,27,29,.35)]"
              style={{ background: BAND_META[b].bg, borderRadius: isSquare(b) ? 3 : 99 }} />
            {BAND_META[b].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[11px] w-[11px] rounded-full border-2 border-[#7d8b8d] bg-white" />
          Fewer than 6 tests
        </span>
        <span className="text-rh-ink3">Poor and bad are squares.</span>
      </div>
    )}
    </div>
  );
}
