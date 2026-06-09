import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EaSyncButton } from "@/components/EaSyncButton";
import { StationMap } from "@/components/StationMap";
import type { RiverGauge, RainfallStation, FlowReading, RainfallReading } from "@/lib/types";

export default async function EnvironmentPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: gauges }, { data: stations }, { data: flow }, { data: rain }] =
    await Promise.all([
      supabase.from("river_gauges").select("*").order("name"),
      supabase.from("rainfall_stations").select("*").order("name"),
      supabase.from("flow_readings").select("*").order("reading_date", { ascending: false }).limit(10),
      supabase.from("rainfall_readings").select("*").order("reading_date", { ascending: false }).limit(10),
    ]);

  const latestFlow = (flow as FlowReading[]) ?? [];
  const latestRain = (rain as RainfallReading[]) ?? [];
  const stationPins = ((stations as RainfallStation[]) ?? [])
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.latitude!, lng: s.longitude! }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rainfall &amp; river flow</h1>
        {profile.role === "admin" && <EaSyncButton />}
      </div>

      {stationPins.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Rainfall stations map</h2>
          <StationMap stations={stationPins} height="360px" />
          <p className="mt-2 text-xs text-gray-400">{stationPins.length} stations · click a marker to open its page.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">River-flow gauges</h2>
          {((gauges as RiverGauge[]) ?? []).map((g) => (
            <div key={g.id} className="text-sm text-gray-700">
              {g.name} <span className="text-gray-400">· {g.ea_station_id}</span>
            </div>
          ))}
          <h3 className="mt-3 text-xs uppercase text-gray-400">Latest daily flow</h3>
          <table className="mt-1 min-w-full text-sm">
            <tbody>
              {latestFlow.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{r.reading_date}</td>
                  <td className="py-1 pr-4">{r.flow_m3s != null ? `${r.flow_m3s} m³/s` : "—"}</td>
                  <td className="py-1 text-gray-500">{r.level_m != null ? `${r.level_m} m` : ""}</td>
                </tr>
              ))}
              {!latestFlow.length && <tr><td className="py-1 text-gray-500">No data yet — sync to pull readings.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Rainfall stations</h2>
          {((stations as RainfallStation[]) ?? []).map((s) => (
            <div key={s.id} className="text-sm">
              <Link href={`/rainfall-stations/${s.id}`} className="font-medium text-river-700 hover:underline">{s.name}</Link>{" "}
              <span className="text-gray-400">· {s.ea_station_id}</span>
            </div>
          ))}
          <h3 className="mt-3 text-xs uppercase text-gray-400">Latest daily rainfall</h3>
          <table className="mt-1 min-w-full text-sm">
            <tbody>
              {latestRain.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{r.reading_date}</td>
                  <td className="py-1">{r.rainfall_mm != null ? `${r.rainfall_mm} mm` : "—"}</td>
                </tr>
              ))}
              {!latestRain.length && <tr><td className="py-1 text-gray-500">No data yet — sync to pull readings.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
