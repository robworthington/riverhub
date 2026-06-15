import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SystemForm } from "@/components/SystemForm";
import type { SewageSystem } from "@/lib/types";

export default async function SewageSystemsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: systems }, { data: assets }] = await Promise.all([
    supabase.from("sewage_systems").select("*").order("name"),
    supabase.from("sewage_assets").select("sewage_system_id, system_match_confidence"),
  ]);

  const counts = new Map<string, number>();
  const needsReview = new Set<string>(); // systems with any medium/low-confidence member
  for (const a of (assets as { sewage_system_id: string | null; system_match_confidence: string | null }[]) ?? []) {
    if (!a.sewage_system_id) continue;
    counts.set(a.sewage_system_id, (counts.get(a.sewage_system_id) ?? 0) + 1);
    if (a.system_match_confidence === "medium" || a.system_match_confidence === "low") needsReview.add(a.sewage_system_id);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sewage systems</h1>
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Add a system</h2>
        <SystemForm />
      </div>
      {!systems?.length ? (
        <p className="text-sm text-gray-500">No systems yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Treatment works</th>
                <th className="px-4 py-2">Assets</th>
                <th className="px-4 py-2">Grouping</th>
                <th className="px-4 py-2">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(systems as SewageSystem[]).map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/sewage-systems/${s.id}`} className="font-medium text-river-700 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{counts.get(s.id) ?? 0}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {s.source === "wwca" ? `Works catchment${s.uww_code ? ` · ${s.uww_code}` : ""}` : "Manual"}
                  </td>
                  <td className="px-4 py-2">
                    {needsReview.has(s.id)
                      ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">check members</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
