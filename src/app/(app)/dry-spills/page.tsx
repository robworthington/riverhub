import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WeatherBadge } from "@/components/edm-ui";
import { buildRainIndexByStation, indexForStation, classifySpill, EA_THRESHOLD_MM } from "@/lib/dryspill";
import type { SewageSystem } from "@/lib/types";

interface EventRow {
  id: string;
  asset_id: string;
  event_start: string;
  event_end: string | null;
  ongoing: boolean;
  duration_minutes: number | null;
  sewage_assets: { asset_name: string; sewage_system_id: string | null; rainfall_station_id: string | null } | null;
}

const WINDOWS = [1, 3, 4];

export default async function DrySpillsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  await requireProfile();
  const sp = await searchParams;
  const windowDays = WINDOWS.includes(Number(sp.window)) ? Number(sp.window) : 1;
  const supabase = await createClient();

  const [{ data: events }, { data: systems }, { data: rain }, { data: flow }] = await Promise.all([
    supabase
      .from("spill_events")
      .select("id, asset_id, event_start, event_end, ongoing, duration_minutes, sewage_assets(asset_name, sewage_system_id, rainfall_station_id)")
      .order("event_start", { ascending: false }),
    supabase.from("sewage_systems").select("id, name"),
    supabase.from("rainfall_readings").select("station_id, reading_date, rainfall_mm"),
    supabase.from("flow_readings").select("reading_date, flow_m3s"),
  ]);

  const rainByStation = buildRainIndexByStation(
    (rain as { station_id: string; reading_date: string; rainfall_mm: number | null }[]) ?? [],
  );
  const flowByDate = new Map<string, number | null>();
  for (const f of (flow as { reading_date: string; flow_m3s: number | null }[]) ?? []) {
    flowByDate.set(f.reading_date, f.flow_m3s);
  }
  const systemName = new Map<string, string>();
  for (const s of (systems as Pick<SewageSystem, "id" | "name">[]) ?? []) systemName.set(s.id, s.name);

  const rows = ((events as unknown as EventRow[]) ?? []).map((e) => {
    const idx = indexForStation(rainByStation, e.sewage_assets?.rainfall_station_id);
    const cls = classifySpill(e.event_start, idx, { windowDays });
    return {
      ...e,
      cls,
      systemName: e.sewage_assets?.sewage_system_id
        ? systemName.get(e.sewage_assets.sewage_system_id) ?? "—"
        : "—",
      flow: flowByDate.get(cls.spillDay) ?? null,
    };
  });

  const counts = { dry: 0, wet: 0, unknown: 0 };
  for (const r of rows) counts[r.cls.weatherClass]++;
  const dry = rows.filter((r) => r.cls.weatherClass === "dry");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dry-weather spills</h1>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="label">Dry-day window</label>
            <select name="window" defaultValue={String(windowDays)} className="input">
              <option value="1">Spill day + 1 (EA definition)</option>
              <option value="3">Spill day + 3 days</option>
              <option value="4">Spill day + 4 days (most robust)</option>
            </select>
          </div>
          <button type="submit" className="btn">Apply</button>
        </form>
      </div>

      <div className="card text-sm text-gray-600">
        A <strong>dry spill</strong> is a storm-overflow discharge with ≤ {EA_THRESHOLD_MM} mm rainfall
        on the spill day and each of the preceding {windowDays} day{windowDays > 1 ? "s" : ""} — i.e. not
        driven by the exceptional rainfall permits require, so <strong>presumptively non-compliant</strong>{" "}
        (UWWTR 1994 Reg 4(4)). Method &amp; caveats: <Link href="https://github.com/robworthington/riverhub/blob/main/DRY-SPILL-METHOD.md" className="text-river-700 underline">DRY-SPILL-METHOD.md</Link>.
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Dry spills" value={counts.dry} highlight />
        <Stat label="Wet (rain-driven)" value={counts.wet} />
        <Stat label="No rainfall data" value={counts.unknown} />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Asset</th>
              <th className="px-4 py-2">System</th>
              <th className="px-4 py-2">Spill start</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Max rain (window)</th>
              <th className="px-4 py-2">River flow</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dry.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/assets/${r.asset_id}`} className="font-medium text-river-700 hover:underline">
                    {r.sewage_assets?.asset_name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{r.systemName}</td>
                <td className="px-4 py-2">{r.event_start.replace("T", " ").slice(0, 16)}</td>
                <td className="px-4 py-2">{r.duration_minutes != null ? `${(r.duration_minutes / 60).toFixed(1)} h` : r.ongoing ? "ongoing" : "—"}</td>
                <td className="px-4 py-2">{r.cls.maxMm != null ? `${r.cls.maxMm} mm` : "—"}</td>
                <td className="px-4 py-2 text-gray-500">{r.flow != null ? `${r.flow} m³/s` : "—"}</td>
                <td className="px-4 py-2"><WeatherBadge weatherClass="dry" /></td>
              </tr>
            ))}
            {!dry.length && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-gray-500">
                  No dry-weather spills detected in the data we hold for this window. (Rainfall history
                  builds up from when syncing began, so older spill events may show as “no rainfall data”.)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="card py-3">
      <div className={`text-2xl font-bold ${highlight ? "text-red-700" : "text-river-700"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
