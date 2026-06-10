import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { AreaMap } from "@/components/AreaMap";
import type { AreaMapSite, AreaMapAsset } from "@/components/AreaMapView";
import { CLASS_COLOUR, type BathingClass } from "@/lib/bathing";

function classBadge(klass: string) {
  const k = klass as BathingClass;
  const colour = k !== "Insufficient data" ? CLASS_COLOUR[k] : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />
      {klass}
    </span>
  );
}

/**
 * Shared council-area detail view. An "area" is one or more parishes — a single parish or every
 * parish in a district. All reads go through the anon public_area_* RPCs.
 */
export async function AreaSection({ ids, title, kicker }: { ids: string[]; title: string; kicker: string }) {
  if (!ids.length) notFound();
  const supabase = createPublicClient();

  const [{ data: overview }, { data: siteRows }, { data: assetRows }, { data: stwRows }] = await Promise.all([
    supabase.rpc("public_area_overview", { p_ids: ids }),
    supabase.rpc("public_area_sites", { p_ids: ids }),
    supabase.rpc("public_area_assets", { p_ids: ids }),
    supabase.rpc("public_area_stw", { p_ids: ids }),
  ]);

  const ov = overview?.[0];
  if (!ov) notFound();

  const sites = siteRows ?? [];
  const assets = assetRows ?? [];
  const stw = stwRows ?? [];

  const mapSites: AreaMapSite[] = sites
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng!, klass: s.klass as BathingClass }));
  const mapAssets: AreaMapAsset[] = assets
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ id: a.id, name: a.name, lat: a.lat!, lng: a.lng!, status: a.status }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/explore/councils" className="text-xs text-gray-400 hover:text-river-700">← All council areas</Link>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500">{kicker}</p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Residents (2021)" value={ov.population != null ? ov.population.toLocaleString() : "—"} />
        <Stat label="Testing sites" value={sites.length.toLocaleString()} />
        <Stat label="Sewage assets" value={assets.length.toLocaleString()} />
        <Stat label="Treatment works" value={stw.length.toLocaleString()} />
      </section>

      {(mapSites.length > 0 || mapAssets.length > 0 || ov.boundary) && (
        <div className="card p-0">
          <AreaMap boundary={ov.boundary} sites={mapSites} assets={mapAssets} linkBase="/explore" publicMode />
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Water-quality sites</h2>
        {sites.length === 0 ? (
          <p className="text-sm text-gray-500">No testing sites in this area.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Site</th>
                  <th className="py-2 pr-4">Water</th>
                  <th className="py-2 pr-4">Classification</th>
                  <th className="py-2 pr-4 text-right">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/explore/sites/${s.id}`} className="text-river-700 hover:underline">{s.name}</Link>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{s.tidal ? "Coastal" : "Freshwater"}</td>
                    <td className="py-2 pr-4">{classBadge(s.klass)}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{s.samples.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Classification uses the EA bathing-water method (log-normal percentiles, ≥10 samples) applied
          across all available data, not an official seasonal assessment.
        </p>
      </div>

      {stw.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Treatment works capacity</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Works</th>
                  <th className="py-2 pr-4 text-right">Capacity (m³/day)</th>
                  <th className="py-2 pr-4 text-right">Est. demand (m³/day)</th>
                  <th className="py-2 pr-4 text-right">Headroom</th>
                  <th className="py-2 pr-4">Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stw.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 pr-4 font-medium text-gray-800">{w.name}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{w.capacity != null ? Math.round(w.capacity).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{w.demand_central != null ? Math.round(w.demand_central).toLocaleString() : "—"}</td>
                    <td className={`py-2 pr-4 text-right ${w.pct_remaining != null && w.pct_remaining < 0 ? "font-semibold text-red-600" : "text-gray-600"}`}>
                      {w.pct_remaining != null ? `${w.pct_remaining}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{w.capacity_basis ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Capacity and demand are <strong>indicative estimates</strong> derived from permit data and EIR
            responses, not measured throughput.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-semibold text-river-700">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
