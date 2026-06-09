import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { distanceKm } from "@/lib/geo";
import { RainfallChart, type RainPoint } from "@/components/RainfallChart";
import { StationMap } from "@/components/StationMap";
import { assetTypeLabel } from "@/components/edm-ui";
import type { RainfallStation, RainfallReading, SewageAsset } from "@/lib/types";

const PER_PAGE = 30;

export default async function RainfallStationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const supabase = await createClient();

  const { data: station } = await supabase.from("rainfall_stations").select("*").eq("id", id).single();
  if (!station) notFound();
  const s = station as RainfallStation;

  const [{ data: chartRows }, { data: gridRows, count }, { data: assets }] = await Promise.all([
    supabase.from("rainfall_readings").select("reading_date, rainfall_mm").eq("station_id", id).order("reading_date").limit(5000),
    supabase
      .from("rainfall_readings")
      .select("reading_date, rainfall_mm", { count: "exact" })
      .eq("station_id", id)
      .order("reading_date", { ascending: false })
      .range(page * PER_PAGE, page * PER_PAGE + PER_PAGE - 1),
    supabase.from("sewage_assets").select("*").eq("rainfall_station_id", id).order("asset_name"),
  ]);

  const points: RainPoint[] = ((chartRows as Pick<RainfallReading, "reading_date" | "rainfall_mm">[]) ?? [])
    .filter((r) => r.rainfall_mm != null)
    .map((r) => ({ t: new Date(r.reading_date).getTime(), mm: r.rainfall_mm! }));
  const grid = (gridRows as Pick<RainfallReading, "reading_date" | "rainfall_mm">[]) ?? [];
  const assetList = (assets as SewageAsset[]) ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const guid = s.ea_station_id ? s.ea_station_id.split("_")[0] : null;
  const eaUrl = guid ? `https://environment.data.gov.uk/hydrology/id/stations/${guid}` : null;

  const facts: [string, React.ReactNode][] = [
    ["EA station ID", s.ea_station_id ?? "—"],
    ["Location", s.latitude != null && s.longitude != null ? `${s.latitude}, ${s.longitude}` : "—"],
    ["Readings", total ? `${total.toLocaleString()} days` : "—"],
    ["Linked assets", String(assetList.length)],
    ["EA data", eaUrl ? <a href={eaUrl} target="_blank" rel="noreferrer" className="text-river-700 underline">EA Hydrology station ↗</a> : "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <Link href="/environment" className="btn-secondary">Back to rainfall &amp; flow</Link>
      </div>

      <div className="card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-gray-400">{k}</dt>
              <dd className="text-sm text-gray-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {s.latitude != null && s.longitude != null && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Location</h2>
          <StationMap
            stations={[{ id: s.id, name: s.name, lat: s.latitude, lng: s.longitude }]}
            assets={assetList
              .filter((a) => a.latitude != null && a.longitude != null)
              .map((a) => ({ id: a.id, name: a.asset_name, lat: a.latitude!, lng: a.longitude! }))}
            height="340px"
          />
          <p className="mt-2 text-xs text-gray-400">Blue = rainfall station · grey = linked sewage asset.</p>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Rainfall over time</h2>
        <RainfallChart points={points} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Linked assets ({assetList.length})</h2>
          {assetList.length === 0 ? (
            <p className="text-sm text-gray-500">No assets use this station for rainfall.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase text-gray-400">
                  <tr><th className="py-1 pr-4">Asset</th><th className="py-1 pr-4">Type</th><th className="py-1">Distance</th></tr>
                </thead>
                <tbody>
                  {assetList.map((a) => {
                    const dist =
                      a.latitude != null && a.longitude != null && s.latitude != null && s.longitude != null
                        ? distanceKm(a.latitude, a.longitude, s.latitude, s.longitude)
                        : null;
                    return (
                      <tr key={a.id} className="border-t border-gray-100">
                        <td className="py-1 pr-4"><Link href={`/assets/${a.id}`} className="text-river-700 hover:underline">{a.asset_name}</Link></td>
                        <td className="py-1 pr-4 text-gray-500">{assetTypeLabel(a.asset_type)}</td>
                        <td className="py-1 text-gray-500">{dist != null ? `${dist} km` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Rainfall data</h2>
            <span className="text-xs text-gray-400">{total.toLocaleString()} readings</span>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="py-1 pr-6">Date</th><th className="py-1">Rainfall</th></tr>
            </thead>
            <tbody>
              {grid.map((r) => (
                <tr key={r.reading_date} className="border-t border-gray-100">
                  <td className="py-1 pr-6">{r.reading_date}</td>
                  <td className="py-1">{r.rainfall_mm != null ? `${r.rainfall_mm} mm` : "—"}</td>
                </tr>
              ))}
              {!grid.length && <tr><td className="py-1 text-gray-500">No readings.</td></tr>}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              {page > 0 ? <Link href={`/rainfall-stations/${id}?page=${page - 1}`} className="btn-secondary">← Newer</Link> : <span />}
              <span className="text-xs text-gray-400">Page {page + 1} of {totalPages}</span>
              {page < totalPages - 1 ? <Link href={`/rainfall-stations/${id}?page=${page + 1}`} className="btn-secondary">Older →</Link> : <span />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
