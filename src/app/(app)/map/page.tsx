import { createClient } from "@/lib/supabase/server";
import { MapClient } from "@/components/MapClient";
import type { MapSite, MapAsset } from "@/components/MapView";
import { classify, worstClass, CLASS_COLOUR, type BathingClass } from "@/lib/bathing";
import type { EdmSnapshot, TestType } from "@/lib/types";

export default async function MapPage() {
  const supabase = await createClient();

  const [{ data: sites }, { data: assets }, { data: snaps }, { data: types }] = await Promise.all([
    supabase.from("test_sites").select("id, name, latitude, longitude, tidal"),
    supabase.from("sewage_assets").select("id, asset_name, latitude, longitude"),
    supabase.from("edm_snapshots").select("asset_id, status, snapshot_date").order("captured_at", { ascending: false }),
    supabase.from("test_types").select("id, test_name"),
  ]);

  const latest = new Map<string, number | null>();
  for (const s of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
    if (!latest.has(s.asset_id)) latest.set(s.asset_id, s.status);
  }

  // indicative bathing-water classification per site (culture E. coli + intestinal enterococci)
  const typeList = (types as Pick<TestType, "id" | "test_name">[]) ?? [];
  const ecoliId = typeList.find((t) => t.test_name === "E. coli (culture)")?.id;
  const ieId = typeList.find((t) => t.test_name === "Intestinal enterococci (culture)")?.id;
  const siteVals = new Map<string, { ecoli: number[]; ie: number[] }>();
  const collectCls = async (typeId: string | undefined, key: "ecoli" | "ie") => {
    if (!typeId) return;
    const { data } = await supabase
      .from("test_results")
      .select("result, site_id")
      .eq("test_type_id", typeId)
      .not("site_id", "is", null)
      .limit(5000);
    for (const r of (data as { result: number | null; site_id: string }[]) ?? []) {
      if (r.result == null) continue;
      const e = siteVals.get(r.site_id) ?? { ecoli: [], ie: [] };
      e[key].push(r.result);
      siteVals.set(r.site_id, e);
    }
  };
  await collectCls(ecoliId, "ecoli");
  await collectCls(ieId, "ie");

  const siteList = (sites as { id: string; name: string; latitude: number | null; longitude: number | null; tidal: boolean }[]) ?? [];
  const siteKlass = new Map<string, BathingClass>();
  for (const s of siteList) {
    const v = siteVals.get(s.id);
    if (!v) continue;
    const k = worstClass(classify(v.ecoli, s.tidal, "ecoli").klass, classify(v.ie, s.tidal, "ie").klass);
    siteKlass.set(s.id, k);
  }

  const mapSites: MapSite[] = siteList
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.latitude!, lng: s.longitude!, klass: siteKlass.get(s.id) ?? null }));

  const mapAssets: MapAsset[] = ((assets as { id: string; asset_name: string; latitude: number | null; longitude: number | null }[]) ?? [])
    .filter((a) => a.latitude != null && a.longitude != null)
    .map((a) => ({ id: a.id, name: a.asset_name, lat: a.latitude!, lng: a.longitude!, status: latest.get(a.id) ?? null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Map</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <Legend colour={CLASS_COLOUR.Excellent} label="Site — Excellent" />
          <Legend colour={CLASS_COLOUR.Good} label="Good" />
          <Legend colour={CLASS_COLOUR.Sufficient} label="Sufficient" />
          <Legend colour={CLASS_COLOUR.Poor} label="Poor" />
          <Legend colour="#1d7c8c" label="Site — no class" />
          <Legend colour="#16a34a" label="Asset — not spilling" />
          <Legend colour="#dc2626" label="Asset — spilling" />
        </div>
      </div>

      {!mapSites.length && !mapAssets.length ? (
        <p className="text-sm text-gray-500">
          No mapped locations yet. Add coordinates to sites or assets to see them here.
        </p>
      ) : (
        <MapClient sites={mapSites} assets={mapAssets} />
      )}
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: colour }} />
      {label}
    </span>
  );
}
