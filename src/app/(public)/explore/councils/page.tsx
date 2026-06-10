import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Council areas — River Dart Data",
  description:
    "Water-quality sites, sewage assets, spills and treatment-works capacity for the River Dart catchment, broken down by district and parish.",
};

export default async function PublicCouncilsPage() {
  const supabase = createPublicClient();
  const [{ data: districts }, { data: parishes }] = await Promise.all([
    supabase.rpc("public_districts"),
    supabase.rpc("public_parishes"),
  ]);

  const parishList = parishes ?? [];
  const byDistrict = new Map<string, { id: string; name: string }[]>();
  for (const p of parishList) {
    const list = byDistrict.get(p.district) ?? [];
    list.push({ id: p.id, name: p.name });
    byDistrict.set(p.district, list);
  }

  const districtList = (districts ?? []).slice().sort((a, b) => a.district.localeCompare(b.district));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">District &amp; parish councils</h1>
        <p className="mt-1 text-sm text-gray-600">
          Slice the catchment data by administrative area — population, water-quality sites, sewage assets
          and treatment-works capacity for each district and its parishes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {districtList.map((d) => {
          const parishesIn = (byDistrict.get(d.district) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={d.district} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/explore/councils/district/${encodeURIComponent(d.district)}`}
                  className="text-lg font-semibold text-river-700 hover:underline"
                >
                  {d.district}
                </Link>
                <span className="text-xs text-gray-500">
                  {d.parishes} parishes{d.population != null ? ` · ${d.population.toLocaleString()} residents` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {parishesIn.map((p) => (
                  <Link key={p.id} href={`/explore/councils/parish/${p.id}`} className="text-gray-600 hover:text-river-700 hover:underline">
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {!districtList.length && <p className="text-sm text-gray-500">No parish boundaries loaded yet.</p>}
      </div>
    </div>
  );
}
