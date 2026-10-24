import { RiverLink } from "@/components/public/RiverLink";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentRiver, getBranding } from "@/lib/river-context";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Council areas — ${b.portalName}`,
    description: `Water-quality sites, sewage assets, spills and treatment-works capacity for the ${b.riverName} catchment, broken down by district and parish.`,
  };
}

export default async function PublicCouncilsPage() {
  const supabase = createPublicClient();
  const org = (await getCurrentRiver())?.orgId;
  const [{ data: districts }, { data: parishes }] = await Promise.all([
    supabase.rpc("public_districts", { p_org: org }),
    supabase.rpc("public_parishes", { p_org: org }),
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
                <RiverLink
                  href={`/explore/councils/district/${encodeURIComponent(d.district)}`}
                  className="text-lg font-semibold text-river-700 hover:underline"
                >
                  {d.district}
                </RiverLink>
                <span className="text-xs text-gray-500">
                  {d.parishes} parishes{d.population != null ? ` · ${d.population.toLocaleString()} residents` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {parishesIn.map((p) => (
                  <RiverLink key={p.id} href={`/explore/councils/parish/${p.id}`} className="text-gray-600 hover:text-river-700 hover:underline">
                    {p.name}
                  </RiverLink>
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
