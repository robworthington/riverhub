import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeStats, parseThreshold } from "@/lib/stats";
import { TimeSeriesChart, type ChartPoint, type ThresholdLine } from "@/components/TimeSeriesChart";
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

  // Threshold reference lines from the selected test type
  const thresholds: ThresholdLine[] = [];
  const rt = (selectedType?.regulatory_thresholds ?? {}) as Record<string, unknown>;
  const good = parseThreshold(rt["bathing_water_good"]);
  const excellent = parseThreshold(rt["bathing_water_excellent"]);
  if (excellent) thresholds.push({ value: excellent, label: `Excellent ≤${excellent}`, colour: "#16a34a" });
  if (good) thresholds.push({ value: good, label: `Good ≤${good}`, colour: "#d97706" });

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
        <Stat label="Std dev" value={stats.sd} />
        <Stat label="Min" value={stats.min} />
        <Stat label="Max" value={stats.max} />
        <Stat label="Range" value={stats.range} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {selectedType ? selectedType.test_name : "Results"} over time
          {selectedType?.primary_unit ? ` (${selectedType.primary_unit})` : ""}
        </h2>
        <TimeSeriesChart points={points} unit={selectedType?.primary_unit ?? null} thresholds={thresholds} />
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
