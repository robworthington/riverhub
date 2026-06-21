import Link from "next/link";
import type { FeatureCollection, Geometry } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { PollutionMapClient } from "@/components/PollutionMapClient";
import type { SitePin } from "@/components/PollutionMapView";
import type { TestType } from "@/lib/types";

interface AreaRow { area_key: string; name: string; n: number; vmin: number; vmax: number; vmean: number; vmedian: number; tidal_majority: boolean; geojson: string }
interface RiverRow { segment_id: string; name: string | null; geojson: string; n: number; vmedian: number; tidal: boolean; nearest_site: string | null }
interface SiteRow { site_id: string; name: string; lat: number; lng: number; tidal: boolean; n: number; vmedian: number }

// EA determinands offered on the heatmap (prefLabel → display + unit). Relative-scale coloured.
const EA_DETS: { key: string; label: string; unit: string }[] = [
  { key: "Orthophosphate, reactive as P", label: "Orthophosphate", unit: "mg/l" },
  { key: "Ammoniacal Nitrogen as N", label: "Ammonia (N)", unit: "mg/l" },
  { key: "Nitrate as N", label: "Nitrate (N)", unit: "mg/l" },
  { key: "Nitrogen, Total Oxidised as N", label: "Total oxidised N", unit: "mg/l" },
  { key: "BOD : 5 Day ATU", label: "BOD (5-day)", unit: "mg/l" },
  { key: "Oxygen, Dissolved, % Saturation", label: "Dissolved oxygen", unit: "%" },
  { key: "Solids, Suspended at 105 C", label: "Suspended solids", unit: "mg/l" },
];

function terciles(values: number[]): [number, number] {
  const v = values.filter((x) => x != null).slice().sort((a, b) => a - b);
  if (v.length < 3) return [Infinity, Infinity];
  return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]];
}
function relColour(v: number | null, t1: number, t2: number): string {
  if (v == null) return "#cbd5e1";
  if (v <= t1) return "#16a34a"; // low — green
  if (v <= t2) return "#d97706"; // mid — amber
  return "#dc2626"; // high — red
}

function areaFC(rows: AreaRow[], colour?: (v: number | null) => string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature" as const,
      geometry: JSON.parse(r.geojson) as Geometry,
      properties: {
        name: r.name, n: r.n, min: r.vmin, max: r.vmax, mean: r.vmean, median: r.vmedian,
        tidal: r.tidal_majority, colour: colour && r.n ? colour(r.vmean ?? r.vmedian) : undefined,
      },
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
  const selectValue = sp.type || "all";
  const eaDet = selectValue.startsWith("ea:") ? selectValue.slice(3) : null;

  let districtFC: FeatureCollection, parishFC: FeatureCollection, riverFC: FeatureCollection, sitePins: SitePin[];
  let unit = "CFU/100mL";
  let nutrient = false;

  if (eaDet) {
    nutrient = true;
    unit = EA_DETS.find((d) => d.key === eaDet)?.unit ?? "";
    const [{ data: d }, { data: p }, { data: s }] = await Promise.all([
      supabase.rpc("ea_area_pollution", { p_level: "district", p_determinand: eaDet }),
      supabase.rpc("ea_area_pollution", { p_level: "parish", p_determinand: eaDet }),
      supabase.rpc("ea_site_pollution", { p_determinand: eaDet }),
    ]);
    const drows = (d as AreaRow[]) ?? [], prows = (p as AreaRow[]) ?? [];
    const [t1, t2] = terciles([...drows, ...prows].filter((r) => r.n).map((r) => r.vmean ?? r.vmedian));
    const cf = (v: number | null) => relColour(v, t1, t2);
    districtFC = areaFC(drows, cf);
    parishFC = areaFC(prows, cf);
    riverFC = { type: "FeatureCollection", features: [] };
    const srows = (s as SiteRow[]) ?? [];
    const [st1, st2] = terciles(srows.map((r) => r.vmedian));
    sitePins = srows.map((r) => ({
      id: r.site_id, name: r.name, lat: r.lat, lng: r.lng, tidal: r.tidal, n: r.n, median: r.vmedian,
      colour: relColour(r.vmedian, st1, st2),
    }));
  } else {
    const selected = selectValue !== "all" ? typeList.find((t) => t.id === selectValue)?.id ?? null : null;
    const args = { p_type: selected, p_from: sp.from || null, p_to: sp.to || null };
    const [{ data: districts }, { data: parishes }, { data: rivers }, { data: sites }] = await Promise.all([
      supabase.rpc("area_pollution", { p_level: "district", ...args }),
      supabase.rpc("area_pollution", { p_level: "parish", ...args }),
      supabase.rpc("river_pollution", { ...args, p_max_dist_m: 500 }),
      supabase.rpc("site_pollution", args),
    ]);
    districtFC = areaFC((districts as AreaRow[]) ?? []);
    parishFC = areaFC((parishes as AreaRow[]) ?? []);
    riverFC = {
      type: "FeatureCollection",
      features: ((rivers as RiverRow[]) ?? []).map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geojson) as Geometry,
        properties: { name: r.name, n: r.n, median: r.vmedian, tidal: r.tidal, nearest: r.nearest_site },
      })),
    };
    sitePins = ((sites as SiteRow[]) ?? []).map((s) => ({ id: s.site_id, name: s.name, lat: s.lat, lng: s.lng, tidal: s.tidal, n: s.n, median: s.vmedian }));
  }

  const hasData = districtFC.features.length || parishFC.features.length || riverFC.features.length || sitePins.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pollution map</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          {nutrient ? (
            <>
              <Legend colour="#16a34a" label="Lower third" />
              <Legend colour="#d97706" label="Middle third" />
              <Legend colour="#dc2626" label="Upper third" />
              <Legend colour="#cbd5e1" label="No data" />
              <span className="text-gray-400">relative scale per determinand (higher = redder; note: for dissolved oxygen, higher is better)</span>
            </>
          ) : (
            <>
              <Legend colour="#16a34a" label="Within Excellent" />
              <Legend colour="#d97706" label="Up to Good" />
              <Legend colour="#dc2626" label="Above Good" />
              <Legend colour="#cbd5e1" label="No data" />
              <span className="text-gray-400">bands: coastal 250/500 · freshwater 500/1000 CFU/100mL</span>
            </>
          )}
        </div>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Indicator</label>
          <select name="type" defaultValue={selectValue} className="input">
            <optgroup label="Citizen sampling (E. coli)">
              <option value="all">E. coli (all methods)</option>
              {typeList.map((t) => (
                <option key={t.id} value={t.id}>{t.test_name}</option>
              ))}
            </optgroup>
            <optgroup label="EA monitoring (relative scale)">
              {EA_DETS.map((d) => (
                <option key={d.key} value={`ea:${d.key}`}>{d.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        {!nutrient && (
          <>
            <div>
              <label className="label">From</label>
              <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
            </div>
          </>
        )}
        <button type="submit" className="btn">Apply</button>
        <Link href="/heatmap" className="btn-secondary">Reset</Link>
      </form>

      <p className="text-xs text-gray-400">
        Toggle layers (top-right).{" "}
        {nutrient
          ? "EA determinand: district / parish choropleths and EA sampling points coloured by a relative (tercile) scale across the catchment — green = lowest third, red = highest. Chemistry/nutrient values, not bacteria."
          : "Citizen E. coli: choropleths + river stretches + testing sites coloured by the EA bathing-water band for each area's water type. E. coli (all methods) pools culture + Petrifilm."}
        {" "}Hover for details.
      </p>

      {!hasData ? (
        <p className="text-sm text-gray-500">No data for this indicator yet.</p>
      ) : (
        <PollutionMapClient
          districts={districtFC}
          parishes={parishFC}
          rivers={riverFC}
          sites={sitePins}
          unit={unit}
          siteHrefPrefix={nutrient ? "/explore/ea-monitoring/" : undefined}
        />
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
