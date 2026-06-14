import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WeatherBadge } from "@/components/edm-ui";
import { EA_THRESHOLD_MM, DEFAULT_MIN_SPILL_MINUTES, METHODOLOGY_URL, METHODOLOGY_VERSION } from "@/lib/dryspill";

interface SummaryRow {
  asset_id: string;
  asset_name: string | null;
  system_name: string | null;
  dry: number;
  wet: number;
  unknown: number;
  total: number;
}

const WINDOWS = [1, 3, 4];

export default async function DrySpillsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; year?: string; min?: string }>;
}) {
  await requireProfile();
  const sp = await searchParams;
  const windowDays = WINDOWS.includes(Number(sp.window)) ? Number(sp.window) : 1;
  const showAll = sp.min === "all";
  const minMinutes = showAll ? 0 : DEFAULT_MIN_SPILL_MINUTES;
  const supabase = await createClient();

  // years that actually have spill events, with counts; default to the busiest (not the
  // sparse current year, which only holds a few live-feed events).
  const thisYear = new Date().getUTCFullYear();
  const yearCounts: { year: number; count: number }[] = [];
  for (let y = 2021; y <= thisYear; y++) {
    const { count } = await supabase
      .from("spill_events")
      .select("*", { count: "exact", head: true })
      .gte("event_start", `${y}-01-01`)
      .lt("event_start", `${y + 1}-01-01`);
    if (count && count > 0) yearCounts.push({ year: y, count });
  }
  const years = yearCounts.map((y) => y.year).sort((a, b) => b - a);
  const busiest = [...yearCounts].sort((a, b) => b.count - a.count)[0]?.year ?? thisYear;
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : busiest;

  const [{ data }, { data: allData }] = await Promise.all([
    supabase.rpc("dry_spill_summary", {
      p_window: windowDays, p_threshold: EA_THRESHOLD_MM, p_year: year, p_min_minutes: minMinutes,
    }),
    minMinutes > 0
      ? supabase.rpc("dry_spill_summary", {
          p_window: windowDays, p_threshold: EA_THRESHOLD_MM, p_year: year, p_min_minutes: 0,
        })
      : Promise.resolve({ data: null }),
  ]);
  const rows = (data as SummaryRow[]) ?? [];
  const totalShown = rows.reduce((a, r) => a + r.total, 0);
  const totalAll = ((allData as SummaryRow[]) ?? rows).reduce((a, r) => a + r.total, 0);
  const hidden = Math.max(0, totalAll - totalShown);

  const counts = rows.reduce(
    (a, r) => ({ dry: a.dry + r.dry, wet: a.wet + r.wet, unknown: a.unknown + r.unknown }),
    { dry: 0, wet: 0, unknown: 0 },
  );
  const withDry = rows.filter((r) => r.dry > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dry-weather spills</h1>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="label">Year</label>
            <select name="year" defaultValue={String(year)} className="input">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Dry-day window</label>
            <select name="window" defaultValue={String(windowDays)} className="input">
              <option value="1">Spill day + 1 (EA definition)</option>
              <option value="3">Spill day + 3 days</option>
              <option value="4">Spill day + 4 days (most robust)</option>
            </select>
          </div>
          <div>
            <label className="label">Spill length</label>
            <select name="min" defaultValue={showAll ? "all" : "min"} className="input">
              <option value="min">≥ {DEFAULT_MIN_SPILL_MINUTES} min only</option>
              <option value="all">Show all (incl. shorter)</option>
            </select>
          </div>
          <button type="submit" className="btn">Apply</button>
        </form>
      </div>

      <div className="card text-sm text-gray-600">
        A <strong>dry spill</strong> is a storm-overflow discharge with ≤ {EA_THRESHOLD_MM} mm rainfall
        (at the asset&rsquo;s nearest gauge) on the spill day and each of the preceding {windowDays} day
        {windowDays > 1 ? "s" : ""} — i.e. not driven by the exceptional rainfall permits require, so{" "}
        <strong>presumptively non-compliant</strong> (UWWTR 1994 Reg 4(4)). Method &amp; caveats:{" "}
        <Link href={METHODOLOGY_URL} className="text-river-700 underline">DRY-SPILL-METHOD.md</Link>{" "}
        <span className="text-gray-400">({METHODOLOGY_VERSION})</span>.
      </div>

      <p className="text-xs text-gray-500">
        {showAll ? (
          <>Showing <strong>all</strong> spills including those under {DEFAULT_MIN_SPILL_MINUTES} min.{" "}
          <Link href={`?year=${year}&window=${windowDays}`} className="text-river-700 underline">Hide short spills</Link></>
        ) : (
          <>Showing the <strong>{totalShown.toLocaleString()}</strong> spills ≥ {DEFAULT_MIN_SPILL_MINUTES} min
          {hidden > 0 ? <> · <strong>{hidden.toLocaleString()}</strong> shorter spills hidden (likely single-interval monitor noise).{" "}
          <Link href={`?year=${year}&window=${windowDays}&min=all`} className="text-river-700 underline">Show all</Link></> : "."}</>
        )}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Dry spills" value={counts.dry} highlight />
        <Stat label="Wet (rain-driven)" value={counts.wet} />
        <Stat label="No rainfall data" value={counts.unknown} />
      </div>

      <p className="text-xs text-gray-400">
        Per-asset summary for {year}. Open an asset for its individual dry-weather spill events,
        dates, rainfall and river flow.
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Asset</th>
              <th className="px-4 py-2">System</th>
              <th className="px-4 py-2">Dry spills</th>
              <th className="px-4 py-2">Wet</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">% dry</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {withDry.map((r) => (
              <tr key={r.asset_id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/assets/${r.asset_id}`} className="font-medium text-river-700 hover:underline">
                    {r.asset_name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500">{r.system_name ?? "—"}</td>
                <td className="px-4 py-2 font-semibold text-red-700">{r.dry}</td>
                <td className="px-4 py-2 text-gray-500">{r.wet}</td>
                <td className="px-4 py-2 text-gray-500">{r.total}</td>
                <td className="px-4 py-2">{r.total ? Math.round((r.dry / r.total) * 100) : 0}%</td>
                <td className="px-4 py-2"><WeatherBadge weatherClass="dry" /></td>
              </tr>
            ))}
            {!withDry.length && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-gray-500">
                  No dry-weather spills detected for {year} at this window
                  {counts.unknown > 0 ? ` (${counts.unknown} spills lack rainfall data).` : "."}
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
