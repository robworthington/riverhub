import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Testing sites — River Dart Data",
  description:
    "Every water-quality testing site in the River Dart catchment, with sample counts and links to each site's full history.",
};

function typeLabel(t: string | null): string {
  if (t === "bathing_water") return "Bathing water";
  if (t === "community_designated") return "Community designated";
  return "—";
}

export default async function PublicSitesPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_sites");
  const sites = (data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Testing sites</h1>
        <p className="mt-1 text-sm text-gray-600">
          {sites.length.toLocaleString()} monitored sites across the catchment. Open any site for its
          sample history and E. coli trend.
        </p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Site</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Parish</th>
              <th className="px-4 py-2">Water</th>
              <th className="px-4 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sites.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/explore/sites/${s.id}`} className="font-medium text-river-700 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{typeLabel(s.type)}</td>
                <td className="px-4 py-2 text-gray-600">{s.parish ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{s.tidal ? "Coastal" : "Freshwater"}</td>
                <td className="px-4 py-2 text-right text-gray-600">{s.samples.toLocaleString()}</td>
              </tr>
            ))}
            {!sites.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No testing sites published yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
