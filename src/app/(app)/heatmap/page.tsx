import Link from "next/link";
import type { FeatureCollection, Geometry } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { ChoroplethClient } from "@/components/ChoroplethClient";
import type { TestType } from "@/lib/types";

interface HeatRow {
  parish_id: string;
  parish_name: string;
  mean_result: number;
  n: number;
  geojson: string;
}

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: types } = await supabase.from("test_types").select("*").order("test_name");
  const typeList = (types as TestType[]) ?? [];
  const selectedType = typeList.find((t) => t.id === sp.type) ?? typeList[0];

  const { data: rows } = await supabase.rpc("parish_heat", {
    p_type: selectedType?.id ?? null,
    p_from: sp.from || null,
    p_to: sp.to || null,
  });

  const heat = (rows as HeatRow[]) ?? [];
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: heat.map((r) => ({
      type: "Feature" as const,
      geometry: JSON.parse(r.geojson) as Geometry,
      properties: { name: r.parish_name, mean: r.mean_result, n: r.n },
    })),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pollution heat map by parish</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <Legend colour="#16a34a" label="≤250 (excellent)" />
          <Legend colour="#d97706" label="251–500 (good)" />
          <Legend colour="#dc2626" label="&gt;500 (poor)" />
        </div>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Test type</label>
          <select name="type" defaultValue={selectedType?.id ?? ""} className="input">
            {typeList.map((t) => (
              <option key={t.id} value={t.id}>{t.test_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn">Apply</button>
        <Link href="/heatmap" className="btn-secondary">Reset</Link>
      </form>

      {heat.length === 0 ? (
        <p className="text-sm text-gray-500">
          No parish has results for these filters yet. Colour reflects mean{" "}
          {selectedType?.primary_unit ?? "result"} per parish.
        </p>
      ) : (
        <ChoroplethClient data={fc} />
      )}
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colour }} />
      {label}
    </span>
  );
}
