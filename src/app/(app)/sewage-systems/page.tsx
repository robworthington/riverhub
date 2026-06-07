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
    supabase.from("sewage_assets").select("sewage_system_id"),
  ]);

  const counts = new Map<string, number>();
  for (const a of (assets as { sewage_system_id: string | null }[]) ?? []) {
    if (a.sewage_system_id) counts.set(a.sewage_system_id, (counts.get(a.sewage_system_id) ?? 0) + 1);
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
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Assets</th>
                <th className="px-4 py-2">Description</th>
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
                  <td className="px-4 py-2 text-gray-500">{s.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
