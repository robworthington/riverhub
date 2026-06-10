import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { TimeSeriesChart, type ChartPoint, type ThresholdLine } from "@/components/TimeSeriesChart";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_sites");
  const site = (data ?? []).find((s) => s.id === id);
  return {
    title: site ? `${site.name} — River Dart Data` : "Testing site — River Dart Data",
    description: site
      ? `Water-quality sample history and E. coli trend for ${site.name}${site.parish ? `, ${site.parish}` : ""}.`
      : undefined,
  };
}

export default async function PublicSiteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();

  const [{ data: sites }, { data: resData }] = await Promise.all([
    supabase.rpc("public_sites"),
    supabase.rpc("public_site_results", { p_site: id }),
  ]);

  const site = (sites ?? []).find((s) => s.id === id);
  if (!site) notFound();
  const results = resData ?? [];

  const ecoliPoints: ChartPoint[] = results
    .filter((r) => r.result != null && /coli/i.test(r.test_name ?? ""))
    .map((r) => ({ t: new Date(r.date_collected).getTime(), value: r.result!, label: r.date_collected }))
    .sort((a, b) => a.t - b.t);
  const excellent = site.tidal ? 250 : 500;
  const good = site.tidal ? 500 : 1000;
  const thresholds: ThresholdLine[] = [
    { value: excellent, label: `Excellent ≤${excellent}`, colour: "#d97706" },
    { value: good, label: `Good ≤${good}`, colour: "#16a34a" },
  ];

  const facts: [string, string][] = [
    ["Type", site.type === "bathing_water" ? "Bathing water" : site.type === "community_designated" ? "Community designated" : "—"],
    ["Parish", site.parish ?? "—"],
    ["Water", site.tidal ? "Coastal / transitional" : "Freshwater"],
    ["Samples", site.samples.toLocaleString()],
  ];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/explore/sites" className="text-xs text-gray-400 hover:text-river-700">← All testing sites</Link>
        <h1 className="mt-1 text-xl font-semibold">{site.name}</h1>
      </div>

      <div className="card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-gray-400">{k}</dt>
              <dd className="text-sm text-gray-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">E. coli over time</h2>
        <p className="mb-3 text-xs text-gray-400">
          Log scale. Reference lines are the EA bathing-water boundaries for {site.tidal ? "coastal/transitional" : "inland"} waters
          (Excellent ≤{excellent}, Good ≤{good} CFU/100mL) — shown as a guide.
        </p>
        <TimeSeriesChart points={ecoliPoints} unit="CFU/100mL" thresholds={thresholds} logScale />
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Results</h2>
          <span className="text-xs text-gray-400">{results.length} sample{results.length === 1 ? "" : "s"}</span>
        </div>
        {results.length === 0 ? (
          <p className="text-sm text-gray-500">No results recorded for this site yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Test</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Collected by</th>
                  <th className="px-3 py-2">Weather</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r, i) => (
                  <tr key={`${r.date_collected}-${r.test_name}-${i}`} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-1.5">{r.date_collected}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.test_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.result != null
                        ? `${r.result_qualifier && r.result_qualifier !== "=" ? r.result_qualifier : ""}${r.result}${r.primary_unit ? ` ${r.primary_unit}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.collected_by ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {r.condition ?? ""}{r.observed_weather ? ` (${r.observed_weather})` : ""}
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
