import Link from "next/link";
import type { Metadata } from "next";
import type { FeatureCollection, Geometry } from "geojson";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { PollutionMapClient } from "@/components/PollutionMapClient";
import type { SitePin } from "@/components/PollutionMapView";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Pollution map — ${INSTANCE.portalName}`,
  description: `Interactive map of bacterial pollution across the ${INSTANCE.riverName} catchment: river stretches, parish and district choropleths and every monitored testing site, coloured by EA bathing-water band.`,
};

interface AreaRow { area_key: string; name: string; n: number; vmin: number; vmax: number; vmean: number; vmedian: number; tidal_majority: boolean; geojson: string }

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

export default async function PublicMapPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const supabase = createPublicClient();

  const { data: types } = await supabase.rpc("public_test_types");
  const typeList = types ?? [];
  const selected = sp.type && sp.type !== "all" ? typeList.find((t) => t.id === sp.type)?.id ?? null : null;
  const selectValue = selected ?? "all";

  const [{ data: districts }, { data: parishes }, { data: rivers }, { data: sites }] = await Promise.all([
    supabase.rpc("public_area_pollution", { p_level: "district", p_type: selected }),
    supabase.rpc("public_area_pollution", { p_level: "parish", p_type: selected }),
    supabase.rpc("public_river_pollution", { p_type: selected, p_max_dist_m: 500 }),
    supabase.rpc("public_site_pollution", { p_type: selected }),
  ]);

  const districtFC = areaFC((districts as AreaRow[]) ?? []);
  const parishFC = areaFC((parishes as AreaRow[]) ?? []);
  const riverFC: FeatureCollection = {
    type: "FeatureCollection",
    features: (rivers ?? []).map((r) => ({
      type: "Feature" as const,
      geometry: JSON.parse(r.geojson) as Geometry,
      properties: { name: r.name, n: r.n, median: r.vmedian, tidal: r.tidal, nearest: r.nearest_site },
    })),
  };
  const sitePins: SitePin[] = (sites ?? []).map((s) => ({
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
          <select name="type" defaultValue={selectValue} className="input">
            <option value="all">E. coli (all methods)</option>
            {typeList.map((t) => (
              <option key={t.id} value={t.id}>{t.test_name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">Apply</button>
        <Link href="/explore/map" className="btn-secondary">Reset</Link>
      </form>

      <p className="text-xs text-gray-400">
        Toggle layers (top-right): district / parish choropleths by median value, coloured river stretches
        (each takes its nearest monitored site within 500&nbsp;m), and testing sites. Colour uses the EA
        bathing-water band for each area or site&rsquo;s water type. Hover for median, mean, range and sample count.
      </p>

      {!hasData ? (
        <p className="text-sm text-gray-500">No pollution data to show yet.</p>
      ) : (
        <PollutionMapClient districts={districtFC} parishes={parishFC} rivers={riverFC} sites={sitePins} linkBase="/explore" />
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
