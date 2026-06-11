import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Sewage spills — ${INSTANCE.portalName}`,
  description: `Storm-overflow spill records for the ${INSTANCE.riverName} catchment from Environment Agency EDM returns, including spills that happened in dry weather.`,
};

export default async function PublicSpillsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const supabase = createPublicClient();

  const { data: assets } = await supabase.rpc("public_assets");
  const assetList = assets ?? [];
  const latestYear = assetList.reduce<number | null>(
    (max, a) => (a.latest_year != null && (max == null || a.latest_year > max) ? a.latest_year : max),
    null,
  );

  const year = sp.year ? Number(sp.year) : latestYear ?? new Date().getUTCFullYear() - 1;
  const startYear = 2020;
  const endYear = latestYear ?? year;
  const years: number[] = [];
  for (let y = endYear; y >= startYear; y--) years.push(y);

  const { data: dry } = await supabase.rpc("public_dry_spills", { p_year: year });
  const rows = (dry ?? [])
    .slice()
    .sort((a, b) => b.dry - a.dry || b.total - a.total);

  const totals = rows.reduce(
    (acc, r) => ({ dry: acc.dry + r.dry, wet: acc.wet + r.wet, unknown: acc.unknown + r.unknown, total: acc.total + r.total }),
    { dry: 0, wet: 0, unknown: 0, total: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Sewage spills</h1>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="label">Year</label>
            <select name="year" defaultValue={String(year)} className="input">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">View</button>
        </form>
      </div>

      <p className="text-sm text-gray-600">
        Storm overflows are permitted to spill in heavy rain, but spills in <strong>dry weather</strong> usually
        signal a fault and should not happen. Spills are classified by comparing each event against local rainfall.
        Figures come from Environment Agency Event Duration Monitoring returns.
      </p>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={`Dry spills (${year})`} value={totals.dry} tone="bad" />
        <Stat label="Wet-weather spills" value={totals.wet} />
        <Stat label="Unclassified" value={totals.unknown} />
        <Stat label="Total spills" value={totals.total} />
      </section>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Asset</th>
              <th className="px-4 py-2">System</th>
              <th className="px-4 py-2 text-right">Dry</th>
              <th className="px-4 py-2 text-right">Wet</th>
              <th className="px-4 py-2 text-right">Unknown</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.asset_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{r.asset_name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">{r.system_name ?? "—"}</td>
                <td className={`px-4 py-2 text-right ${r.dry > 0 ? "font-semibold text-red-600" : "text-gray-400"}`}>{r.dry}</td>
                <td className="px-4 py-2 text-right text-gray-600">{r.wet}</td>
                <td className="px-4 py-2 text-right text-gray-400">{r.unknown}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.total}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No spill records for {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Looking for a specific place? The{" "}
        <Link href="/explore/councils" className="text-river-700 hover:underline">council area pages</Link>{" "}
        break spills and assets down by district and parish.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="card text-center">
      <div className={`text-2xl font-semibold ${tone === "bad" && value > 0 ? "text-red-600" : "text-river-700"}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
