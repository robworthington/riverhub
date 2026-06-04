import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TestSite } from "@/lib/types";

export default async function SitesPage() {
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("test_sites")
    .select("*")
    .order("name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Testing sites</h1>
        <Link href="/sites/new" className="btn">Add site</Link>
      </div>

      {!sites?.length ? (
        <p className="text-sm text-gray-500">No sites yet. Add your first testing site.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Tidal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(sites as TestSite[]).map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/sites/${s.id}`} className="font-medium text-river-700 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{s.site_code ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{labelType(s.type)}</td>
                  <td className="px-4 py-2 text-gray-500">{s.tidal ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function labelType(t: TestSite["type"]) {
  if (t === "bathing_water") return "Bathing water";
  if (t === "community_designated") return "Community designated";
  return "—";
}
