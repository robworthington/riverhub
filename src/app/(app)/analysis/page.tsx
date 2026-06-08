import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeStats, parseThreshold } from "@/lib/stats";
import { TimeSeriesChart, type ChartPoint, type ThresholdLine } from "@/components/TimeSeriesChart";
import { RainfallOverlay, type OverlayPoint } from "@/components/RainfallOverlay";
import type { TestSite, TestType } from "@/lib/types";

interface Row {
  id: string;
  date_collected: string;
  result: number | null;
  condition: "wet" | "dry" | null;
  test_sites: { name: string } | null;
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; type?: string; from?: string; to?: string; condition?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: sites }, { data: types }] = await Promise.all([
    supabase.from("test_sites").select("id, name").order("name"),
    supabase.from("test_types").select("*").order("test_name"),
  ]);
  const typeList = (types as TestType[]) ?? [];
  const selectedType = typeList.find((t) => t.id === sp.type) ?? typeList[0];

  let query = supabase
    .from("test_results")
    .select("id, date_collected, result, condition, test_sites(name)")
    .order("date_collected");
  if (sp.site) query = query.eq("site_id", sp.site);
  if (selectedType) query = query.eq("test_type_id", selectedType.id);
  if (sp.from) query = query.gte("date_collected", sp.from);
  if (sp.to) query = query.lte("date_collected", sp.to);
  if (sp.condition) query = query.eq("condition", sp.condition as "wet" | "dry");

  const { data } = await query;
  const rows = (data as unknown as Row[]) ?? [];

  const values = rows.map((r) => r.result).filter((v): v is number => v != null);
  const wet = rows.filter((r) => r.condition === "wet").map((r) => r.result).filter((v): v is number => v != null);
  const dry = rows.filter((r) => r.condition === "dry").map((r) => r.result).filter((v): v is number => v != null);
  const stats = computeStats(values);
  const wetStats = computeStats(wet);
  const dryStats = computeStats(dry);

  const points: ChartPoint[] = rows
    .filter((r) => r.result != null)
    .map((r) => ({ t: new Date(r.date_collected).getTime(), value: r.result!, label: r.date_collected }));

  // Single EA reference line from the selected test type
  const thresholds: ThresholdLine[] = [];
  const rt = (selectedType?.regulatory_thresholds ?? {}) as Record<string, unknown>;
  const single =
    typeof rt["single_reference"] === "number"
      ? (rt["single_reference"] as number)
      : parseThreshold(rt["single_reference"]) ?? parseThreshold(rt["bathing_water_good"]);
  const refLabel = (rt["reference_label"] as string) || "EA reference";
  if (single) thresholds.push({ value: single, label: `${refLabel} (${single})`, colour: "#dc2626" });

  // CFU bacterial counts span <10 to >10000 → plot on a log scale
  const logScale = !!selectedType?.primary_unit?.includes("CFU");
  // exceedances of the single reference line
  const exceedances = single ? values.filter((v) => v > single).length : 0;

  // ---- Rankings: all sites by mean/median for the selected test type ----
  const { data: allForType } = selectedType
    ? await supabase
        .from("test_results")
        .select("result, test_sites(name)")
        .eq("test_type_id", selectedType.id)
    : { data: [] };
  const bySite = new Map<string, number[]>();
  for (const r of (allForType as unknown as { result: number | null; test_sites: { name: string } | null }[]) ?? []) {
    if (r.result == null || !r.test_sites) continue;
    const arr = bySite.get(r.test_sites.name) ?? [];
    arr.push(r.result);
    bySite.set(r.test_sites.name, arr);
  }
  const siteRanks = [...bySite.entries()]
    .map(([name, vals]) => ({ name, ...computeStats(vals) }))
    .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));

  // ---- Asset spill rankings (latest reported year, from EA annual returns) ----
  const { data: assets } = await supabase.from("sewage_assets").select("id, asset_name");
  const { data: annual } = await supabase
    .from("edm_annual_stats")
    .select("asset_id, year, spill_count, total_duration_hours")
    .order("year", { ascending: false });
  const assetAgg = new Map<string, { year: number; spills: number | null; hours: number | null }>();
  for (const s of (annual as { asset_id: string | null; year: number; spill_count: number | null; total_duration_hours: number | null }[]) ?? []) {
    if (!s.asset_id || assetAgg.has(s.asset_id)) continue; // first = latest year
    assetAgg.set(s.asset_id, { year: s.year, spills: s.spill_count, hours: s.total_duration_hours });
  }
  const assetRanks = ((assets as { id: string; asset_name: string }[]) ?? [])
    .map((a) => ({ name: a.asset_name, ...(assetAgg.get(a.id) ?? { year: 0, spills: null, hours: null }) }))
    .filter((a) => a.spills != null)
    .sort((a, b) => (b.spills ?? 0) - (a.spills ?? 0));

  // ---- Pollution vs rainfall overlay (filtered results + daily rainfall) ----
  const { data: rain } = await supabase
    .from("rainfall_readings")
    .select("reading_date, rainfall_mm")
    .order("reading_date");
  const overlay = new Map<string, OverlayPoint>();
  for (const r of (rain as { reading_date: string; rainfall_mm: number | null }[]) ?? []) {
    overlay.set(r.reading_date, { date: r.reading_date, rainfall: r.rainfall_mm, result: null });
  }
  for (const r of rows) {
    if (r.result == null) continue;
    const d = r.date_collected;
    const cur = overlay.get(d) ?? { date: d, rainfall: null, result: null };
    cur.result = cur.result == null ? r.result : Math.max(cur.result, r.result);
    overlay.set(d, cur);
  }
  const overlayData = [...overlay.values()].sort((a, b) => a.date.localeCompare(b.date));

  const exportQs = new URLSearchParams(
    Object.entries({ site: sp.site, type: selectedType?.id, from: sp.from, to: sp.to, condition: sp.condition })
      .filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analysis</h1>
        <Link href={`/api/export/results${exportQs ? `?${exportQs}` : ""}`} className="btn">
          Export CSV
        </Link>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <Filter label="Site" name="site" value={sp.site}>
          <option value="">All sites</option>
          {((sites as Pick<TestSite, "id" | "name">[]) ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Filter>
        <Filter label="Test type" name="type" value={selectedType?.id}>
          {typeList.map((t) => (
            <option key={t.id} value={t.id}>{t.test_name}</option>
          ))}
        </Filter>
        <Filter label="Condition" name="condition" value={sp.condition}>
          <option value="">Any</option>
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
        </Filter>
        <div>
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn">Apply</button>
        <Link href="/analysis" className="btn-secondary">Reset</Link>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Count" value={stats.count} />
        <Stat label="Mean" value={stats.mean} />
        <Stat label="Median" value={stats.median} />
        <Stat label="Max" value={stats.max} />
        <Stat label="Min" value={stats.min} />
        <Stat label={single ? `Over ${single}` : "Exceedances"} value={single ? exceedances : null} />
        <Stat label="% over" value={single && stats.count ? Math.round((exceedances / stats.count) * 100) : null} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {selectedType ? selectedType.test_name : "Results"} over time
          {selectedType?.primary_unit ? ` (${selectedType.primary_unit})` : ""}
        </h2>
        <TimeSeriesChart points={points} unit={selectedType?.primary_unit ?? null} thresholds={thresholds} logScale={logScale} />
        {single ? (
          <p className="mt-2 text-xs text-gray-400">
            Reference line = {refLabel} ({single} {selectedType?.primary_unit}). Bathing-water classification
            is a seasonal percentile, not a single-sample limit — the line is a guide.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Wet vs dry</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr><th className="py-1 pr-6">Condition</th><th className="py-1 pr-6">Count</th><th className="py-1 pr-6">Mean</th><th className="py-1 pr-6">Median</th><th className="py-1 pr-6">Max</th></tr>
          </thead>
          <tbody>
            <Row3 label="Dry" s={dryStats} />
            <Row3 label="Wet" s={wetStats} />
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Pollution vs rainfall</h2>
        <RainfallOverlay data={overlayData} unit={selectedType?.primary_unit ?? null} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Sites ranked by {selectedType?.test_name ?? "result"} (mean)
          </h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="py-1 pr-6">#</th><th className="py-1 pr-6">Site</th><th className="py-1 pr-6">Mean</th><th className="py-1 pr-6">Median</th><th className="py-1 pr-6">n</th></tr>
            </thead>
            <tbody>
              {siteRanks.map((s, i) => (
                <tr key={s.name} className="border-t border-gray-100">
                  <td className="py-1 pr-6">{i + 1}</td>
                  <td className="py-1 pr-6">{s.name}</td>
                  <td className="py-1 pr-6">{s.mean ?? "—"}</td>
                  <td className="py-1 pr-6">{s.median ?? "—"}</td>
                  <td className="py-1 pr-6 text-gray-500">{s.count}</td>
                </tr>
              ))}
              {!siteRanks.length && <tr><td className="py-1 text-gray-500">No data.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Assets ranked by spills (latest reported year)</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="py-1 pr-6">#</th><th className="py-1 pr-6">Asset</th><th className="py-1 pr-6">Spills</th><th className="py-1 pr-6">Hours</th><th className="py-1 pr-6">Year</th></tr>
            </thead>
            <tbody>
              {assetRanks.slice(0, 12).map((a, i) => (
                <tr key={a.name} className="border-t border-gray-100">
                  <td className="py-1 pr-6">{i + 1}</td>
                  <td className="py-1 pr-6">{a.name}</td>
                  <td className="py-1 pr-6">{a.spills}</td>
                  <td className="py-1 pr-6">{a.hours != null ? Math.round(a.hours) : "—"}</td>
                  <td className="py-1 pr-6 text-gray-500">{a.year || "—"}</td>
                </tr>
              ))}
              {!assetRanks.length && <tr><td className="py-1 text-gray-500">No annual data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Filter({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} defaultValue={value ?? ""} className="input">
        {children}
      </select>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="card py-3">
      <div className="text-xl font-bold text-river-700">{value ?? "—"}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Row3({ label, s }: { label: string; s: ReturnType<typeof computeStats> }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1 pr-6">{label}</td>
      <td className="py-1 pr-6">{s.count}</td>
      <td className="py-1 pr-6">{s.mean ?? "—"}</td>
      <td className="py-1 pr-6">{s.median ?? "—"}</td>
      <td className="py-1 pr-6">{s.max ?? "—"}</td>
    </tr>
  );
}
