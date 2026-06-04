import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TestSite, TestType } from "@/lib/types";

interface Row {
  id: string;
  date_collected: string;
  time_collected: string | null;
  result: number | null;
  condition: "wet" | "dry" | null;
  test_sites: { name: string } | null;
  test_types: { test_name: string; primary_unit: string | null } | null;
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; type?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: sites }, { data: types }] = await Promise.all([
    supabase.from("test_sites").select("id, name").order("name"),
    supabase.from("test_types").select("*").order("test_name"),
  ]);

  let query = supabase
    .from("test_results")
    .select("id, date_collected, time_collected, result, condition, test_sites(name), test_types(test_name, primary_unit)")
    .order("date_collected", { ascending: false })
    .limit(500);

  if (sp.site) query = query.eq("site_id", sp.site);
  if (sp.type) query = query.eq("test_type_id", sp.type);
  if (sp.from) query = query.gte("date_collected", sp.from);
  if (sp.to) query = query.lte("date_collected", sp.to);

  const { data } = await query;
  const rows = (data as unknown as Row[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Results</h1>
        <Link href="/results/new" className="btn">Record sample</Link>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Site</label>
          <select name="site" defaultValue={sp.site ?? ""} className="input">
            <option value="">All sites</option>
            {((sites as Pick<TestSite, "id" | "name">[]) ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Test type</label>
          <select name="type" defaultValue={sp.type ?? ""} className="input">
            <option value="">All types</option>
            {((types as TestType[]) ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.test_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input name="from" type="date" defaultValue={sp.from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input name="to" type="date" defaultValue={sp.to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn">Filter</button>
        <Link href="/results" className="btn-secondary">Reset</Link>
      </form>

      {!rows.length ? (
        <p className="text-sm text-gray-500">No results match.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Test</th>
                <th className="px-4 py-2">Result</th>
                <th className="px-4 py-2">Condition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/results/${r.id}`} className="text-river-700 hover:underline">
                      {r.date_collected}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.test_sites?.name ?? "—"}</td>
                  <td className="px-4 py-2">{r.test_types?.test_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.result ?? "—"}
                    {r.result != null && r.test_types?.primary_unit ? ` ${r.test_types.primary_unit}` : ""}
                  </td>
                  <td className="px-4 py-2 capitalize text-gray-500">{r.condition ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
