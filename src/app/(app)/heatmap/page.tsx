import Link from "next/link";
import type { FeatureCollection, Geometry } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { PollutionMapClient } from "@/components/PollutionMapClient";
import type { SitePin } from "@/components/PollutionMapView";
import type { TestType } from "@/lib/types";

interface AreaRow { area_key: string; name: string; n: number; vmin: number; vmax: number; vmean: number; vmedian: number; tidal_majority: boolean; geojson: string }
interface RiverRow { segment_id: string; name: string | null; geojson: string; n: number; vmedian: number; tidal: boolean; nearest_site: string | null }
interface SiteRow { site_id: string; name: string; lat: number; lng: number; tidal: boolean; n: number; vmedian: number }

function areaFC(rows: AreaRow[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature" as const,
      geometry: JSON.parse(r.geojson) as Geometry,
      properties: { name: r.name, n: r.n, min: r.vmin, max: r.vmax, mean: r.vmean, median: r.vmedian, tidal: r.tidal_majority },
    })),
  };
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
  const selectedType =
    typeList.find((t) => t.id === sp.type) ?? typeList.find((t) => t.test_name === "E. coli (culture)") ?? typeList[0];
  const args = { p_type: selectedType?.id ?? "", p_from: sp.from || null, p_to: sp.to || null };

  const [{ data: districts }, { data: parishes }, { data: rivers }, { data: sites }] = await Promise.all([
    supabase.rpc("area_pollution", { p_level: "district", ...args }),
    supabase.rpc("area_pollution", { p_level: "parish", ...args }),
    supabase.rpc("river_pollution", { ...args, p_max_dist_m: 500 }),
    supabase.rpc("site_pollution", args),
  ]);

  const districtFC = areaFC((districts as AreaRow[]) ?? []);
  const parishFC = areaFC((parishes as AreaRow[]) ?? []);
  const riverFC: FeatureCollection = {
    type: "FeatureCollection",
    features: ((rivers as RiverRow[]) ?? []).map((r) => ({
      type: "Feature" as const,
      geometry: JSON.parse(r.geojson) as Geometry,
      properties: { name: r.name, n: r.n, median: r.vmedian, tidal: r.tidal, nearest: r.nearest_site },
    })),
  };
  const sitePins: SitePin[] = ((sites as SiteRow[]) ?? []).map((s) => ({
    id: s.site_id, name: s.name, lat: s.lat, lng: s.lng, tidal: s.tidal, n: s.n, median: s.vmedian,
  }));

  const hasData = districtFC.features.length || parishFC.features.length || riverFC.features.length || sitePins.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pollution map</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <Legend colour="#16a34a" label="Within Excellent" />
          <Legend colour="#d97706" label="Up to Good" />
          <Legend colour="#dc2626" label="Above Good" />
          <Legend colour="#cbd5e1" label="No data" />
          <span className="text-gray-400">bands: coastal 250/500 · freshwater 500/1000 CFU/100mL</span>
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

      <p className="text-xs text-gray-400">
        Toggle layers (top-right): district / parish choropleths by median value, coloured river stretches
        (each stretch takes its nearest monitored site within 500 m), and testing sites. Colour uses the EA
        band for each area/site&rsquo;s water type. Hover for median, mean, min, max and n.
      </p>

      {!hasData ? (
        <p className="text-sm text-gray-500">No pollution data for these filters yet.</p>
      ) : (
        <PollutionMapClient districts={districtFC} parishes={parishFC} rivers={riverFC} sites={sitePins} />
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
