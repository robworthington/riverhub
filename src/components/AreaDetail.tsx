import Link from "next/link";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import { AreaMap } from "@/components/AreaMap";
import { TimeSeriesChart, type ThresholdLine } from "@/components/TimeSeriesChart";
import { SpillTrendChart } from "@/components/SpillTrendChart";
import { CLASS_COLOUR } from "@/lib/bathing";
import type { AreaData } from "@/lib/area";

export function AreaDetail({ data }: { data: AreaData }) {
  const excellent = data.ecoliTidal ? 250 : 500;
  const good = data.ecoliTidal ? 500 : 1000;
  const ecoliThresholds: ThresholdLine[] = [
    { value: excellent, label: `Excellent ≤${excellent}`, colour: "#d97706" },
    { value: good, label: `Good ≤${good}`, colour: "#16a34a" },
  ];
  const mapSites = data.sites
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng!, klass: s.klass }));
  const mapAssets = data.assets
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ id: a.id, name: a.name, lat: a.lat!, lng: a.lng!, status: a.status }));

  return (
    <div className="space-y-4">
      {/* headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Resident population (Census 2021)" value={data.population != null ? data.population.toLocaleString() : "—"} />
        <Stat label="Test sites" value={String(data.sites.length)} />
        <Stat label="Sewage assets" value={String(data.assets.length)} />
        <Stat label="Treatment works" value={String(data.stws.length)} />
      </div>

      {/* map */}
      {(mapSites.length || mapAssets.length || data.boundaryGeojson) && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Map</h2>
          <AreaMap boundary={data.boundaryGeojson} sites={mapSites} assets={mapAssets} />
          <p className="mt-2 text-xs text-gray-400">
            Boundary outlined. Sites coloured by bathing-water class; assets by latest spill status.
          </p>
        </div>
      )}

      {/* charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">E. coli over time</h2>
          <p className="mb-3 text-xs text-gray-400">
            All sites in this area (log scale). Reference lines = EA {data.ecoliTidal ? "coastal" : "inland"} bathing-water
            boundaries (Excellent ≤{excellent}, Good ≤{good} CFU/100mL).
          </p>
          <TimeSeriesChart points={data.ecoliPoints} unit="CFU/100mL" thresholds={ecoliThresholds} logScale />
        </div>
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Annual spill trend</h2>
          <p className="mb-3 text-xs text-gray-400">
            Combined EDM spill count (bars) and total discharge duration (line) per year across the area&rsquo;s assets.
          </p>
          <SpillTrendChart data={data.annualTrend} />
        </div>
      </div>

      {/* test sites */}
      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Test sites &amp; results</h2>
        {data.sites.length === 0 ? (
          <p className="text-sm text-gray-500">No test sites in this area.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="py-1 pr-6">Site</th><th className="py-1 pr-6">Type</th><th className="py-1 pr-6">Classification</th><th className="py-1 pr-6">Samples</th></tr>
              </thead>
              <tbody>
                {data.sites.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="py-1 pr-6"><Link href={`/sites/${s.id}`} className="text-river-700 hover:underline">{s.name}</Link></td>
                    <td className="py-1 pr-6 text-gray-500">{s.tidal ? "Tidal" : "Inland"}{s.type === "bathing_water" ? " · bathing" : ""}</td>
                    <td className="py-1 pr-6">
                      {s.klass === "Insufficient data" ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: CLASS_COLOUR[s.klass] }}>{s.klass}</span>
                      )}
                    </td>
                    <td className="py-1 pr-6 text-gray-500">{s.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* assets + EDM */}
      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Sewage assets &amp; EDM</h2>
        {data.assets.length === 0 ? (
          <p className="text-sm text-gray-500">No sewage assets in this area.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="py-1 pr-6">Asset</th><th className="py-1 pr-6">Type</th><th className="py-1 pr-6">Latest status</th><th className="py-1 pr-6">Spills (latest yr)</th></tr>
              </thead>
              <tbody>
                {data.assets.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="py-1 pr-6"><Link href={`/assets/${a.id}`} className="text-river-700 hover:underline">{a.name}</Link></td>
                    <td className="py-1 pr-6 text-gray-500">{assetTypeLabel(a.type as never)}</td>
                    <td className="py-1 pr-6">{a.status != null ? <StatusBadge status={a.status} /> : <span className="text-gray-400">No data</span>}</td>
                    <td className="py-1 pr-6 text-gray-500">{a.latestSpills != null ? `${a.latestSpills}${a.latestSpillYear ? ` (${a.latestSpillYear})` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STW capacity */}
      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Sewage treatment works — capacity</h2>
        <p className="mb-2 text-xs text-gray-400">
          % remaining = (capacity − central population demand) ÷ capacity. Capacity basis falls back from
          EIR-confirmed installed → permit DWF → processing capacity.
        </p>
        {data.stws.length === 0 ? (
          <p className="text-sm text-gray-500">No treatment works in this area.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="py-1 pr-6">Works</th><th className="py-1 pr-6">Capacity (m³/day)</th><th className="py-1 pr-6">Demand (m³/day)</th><th className="py-1 pr-6">% capacity remaining</th></tr>
              </thead>
              <tbody>
                {data.stws.map((w) => (
                  <tr key={w.id} className="border-t border-gray-100">
                    <td className="py-1 pr-6"><Link href={`/assets/${w.id}`} className="text-river-700 hover:underline">{w.name}</Link></td>
                    <td className="py-1 pr-6 text-gray-600">{w.capacity != null ? `${w.capacity}` : "—"}{w.capacityBasis ? <span className="text-xs text-gray-400"> ({w.capacityBasis})</span> : ""}</td>
                    <td className="py-1 pr-6 text-gray-600">{w.demandCentral != null ? w.demandCentral : "—"}</td>
                    <td className="py-1 pr-6">
                      {w.pctRemaining == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={`font-semibold ${w.pctRemaining < 0 ? "text-red-700" : w.pctRemaining < 20 ? "text-amber-700" : "text-emerald-700"}`}>
                          {w.pctRemaining}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3">
      <div className="text-2xl font-bold text-river-700">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
