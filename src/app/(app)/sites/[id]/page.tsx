import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import { TimeSeriesChart, type ChartPoint, type ThresholdLine } from "@/components/TimeSeriesChart";
import type { Parish, SitePhoto, TestSite, WaterBody } from "@/lib/types";

interface ResultRow {
  id: string;
  date_collected: string;
  time_collected: string | null;
  result: number | null;
  result_qualifier: string | null;
  condition: "wet" | "dry" | null;
  observed_weather: string | null;
  organisation_collecting: string | null;
  test_types: { test_name: string; primary_unit: string | null } | null;
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase.from("test_sites").select("*").eq("id", id).single();
  if (!site) notFound();
  const s = site as TestSite;

  const [{ data: parish }, { data: waterBody }, { data: photos }] = await Promise.all([
    s.parish_id
      ? supabase.from("parishes").select("*").eq("id", s.parish_id).single()
      : Promise.resolve({ data: null }),
    s.water_body_id
      ? supabase.from("water_bodies").select("*").eq("id", s.water_body_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("site_photos").select("*").eq("site_id", id).order("created_at"),
  ]);

  const photoUrls = await Promise.all(
    ((photos as SitePhoto[]) ?? []).map(async (p) => ({
      ...p,
      url: await getSignedUrl(p.storage_path),
    })),
  );

  // results for this site (newest first for the table; E. coli plotted on the chart)
  const { data: resData } = await supabase
    .from("test_results")
    .select("id, date_collected, time_collected, result, result_qualifier, condition, observed_weather, organisation_collecting, test_types(test_name, primary_unit)")
    .eq("site_id", id)
    .order("date_collected", { ascending: false })
    .order("time_collected", { ascending: false })
    .limit(1000);
  const results = (resData as unknown as ResultRow[]) ?? [];

  // E. coli over time (log scale) with tidal-aware EA reference lines
  const ecoliPoints: ChartPoint[] = results
    .filter((r) => r.result != null && /coli/i.test(r.test_types?.test_name ?? ""))
    .map((r) => ({ t: new Date(r.date_collected).getTime(), value: r.result!, label: r.date_collected }))
    .sort((a, b) => a.t - b.t);
  const excellent = s.tidal ? 250 : 500;
  const good = s.tidal ? 500 : 1000;
  const thresholds: ThresholdLine[] = [
    { value: excellent, label: `Excellent ≤${excellent}`, colour: "#d97706" },
    { value: good, label: `Good ≤${good}`, colour: "#16a34a" },
  ];

  const facts: [string, string][] = [
    ["Code", s.site_code ?? "—"],
    ["Type", s.type === "bathing_water" ? "Bathing water" : s.type === "community_designated" ? "Community designated" : "—"],
    ["Parish", parish ? `${(parish as Parish).name} (${(parish as Parish).county})` : "—"],
    ["Water body", waterBody ? (waterBody as WaterBody).label : "—"],
    ["Coordinates", s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : "—"],
    ["What3Words", s.what_three_words ?? "—"],
    ["Tidal", s.tidal ? "Yes" : "No"],
    ["Access point", s.access_point ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <div className="flex gap-2">
          <Link href={`/sites/${id}/edit`} className="btn-secondary">Edit</Link>
          <Link href={`/results/new?site=${id}`} className="btn">Record sample here</Link>
        </div>
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
        {s.description && <p className="mt-4 text-sm text-gray-600">{s.description}</p>}
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">E. coli over time</h2>
        <p className="mb-3 text-xs text-gray-400">
          Log scale. Reference lines = EA bathing-water boundaries for {s.tidal ? "coastal/transitional" : "inland"} waters
          (Excellent ≤{excellent}, Good ≤{good} CFU/100mL) — seasonal percentile classifications, shown as a guide.
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
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.date_collected}{r.time_collected ? ` ${r.time_collected.slice(0, 5)}` : ""}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{r.test_types?.test_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.result != null
                        ? `${r.result_qualifier && r.result_qualifier !== "=" ? r.result_qualifier : ""}${r.result}${r.test_types?.primary_unit ? ` ${r.test_types.primary_unit}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.organisation_collecting ?? "—"}</td>
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

      {photoUrls.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photoUrls.map((p) =>
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={p.caption ?? s.name} className="h-32 w-full rounded-md object-cover" />
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
