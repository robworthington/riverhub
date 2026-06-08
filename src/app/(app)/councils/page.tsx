import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ParishSelect } from "@/components/ParishSelect";

export default async function CouncilsPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: parishes } = await supabase
    .from("parishes")
    .select("id, name, district, census_2021_population")
    .not("boundary", "is", null)
    .order("name");
  const rows = (parishes as { id: string; name: string; district: string; census_2021_population: number | null }[]) ?? [];

  const byDistrict = new Map<string, { id: string; name: string }[]>();
  const popByDistrict = new Map<string, number>();
  for (const p of rows) {
    const list = byDistrict.get(p.district) ?? [];
    list.push({ id: p.id, name: p.name });
    byDistrict.set(p.district, list);
    if (p.census_2021_population != null) popByDistrict.set(p.district, (popByDistrict.get(p.district) ?? 0) + p.census_2021_population);
  }
  const districts = [...byDistrict.keys()].sort();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">District &amp; parish councils</h1>
      <p className="text-sm text-gray-600">
        Slice the catchment data by administrative area — population, water-quality sites, sewage assets,
        EDM spills and treatment-works capacity for each district and its parishes.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {districts.map((d) => {
          const parishesIn = (byDistrict.get(d) ?? []).sort((a, b) => a.name.localeCompare(b.name));
          const pop = popByDistrict.get(d);
          return (
            <div key={d} className="card space-y-3">
              <div className="flex items-center justify-between">
                <Link href={`/councils/district/${encodeURIComponent(d)}`} className="text-lg font-semibold text-river-700 hover:underline">
                  {d}
                </Link>
                <span className="text-xs text-gray-500">{parishesIn.length} parishes{pop != null ? ` · ${pop.toLocaleString()} residents` : ""}</span>
              </div>
              <ParishSelect parishes={parishesIn} />
            </div>
          );
        })}
        {!districts.length && <p className="text-sm text-gray-500">No parish boundaries loaded yet.</p>}
      </div>
    </div>
  );
}
