import type { SupabaseClient } from "@supabase/supabase-js";
import { classify, worstClass, type BathingClass } from "@/lib/bathing";

const ORG_ECOLI = "E. coli (culture)";
const ORG_IE = "Intestinal enterococci (culture)";

export interface AreaSite {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  tidal: boolean;
  type: string | null;
  samples: number;
  klass: BathingClass;
}
export interface AreaAsset {
  id: string;
  name: string;
  type: string | null;
  lat: number | null;
  lng: number | null;
  status: number | null;
  latestSpills: number | null;
  latestSpillYear: number | null;
}
export interface AreaStw {
  id: string;
  name: string;
  systemName: string | null;
  capacity: number | null;
  capacityBasis: string | null; // "installed capacity" | "permit DWF" | "processing capacity"
  demandCentral: number | null;
  pctRemaining: number | null;
}
export interface AreaData {
  parishNames: string[];
  population: number | null;
  boundaryGeojson: string | null;
  sites: AreaSite[];
  assets: AreaAsset[];
  stws: AreaStw[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getAreaData(supabase: SupabaseClient<any>, parishIds: string[]): Promise<AreaData> {
  if (!parishIds.length) {
    return { parishNames: [], population: null, boundaryGeojson: null, sites: [], assets: [], stws: [] };
  }

  const [{ data: parishes }, { data: boundary }, { data: types }] = await Promise.all([
    supabase.from("parishes").select("id, name, census_2021_population").in("id", parishIds),
    supabase.rpc("area_boundary_geojson", { p_ids: parishIds }),
    supabase.from("test_types").select("id, test_name"),
  ]);
  const pRows = (parishes as { id: string; name: string; census_2021_population: number | null }[]) ?? [];
  const popVals = pRows.map((p) => p.census_2021_population).filter((v): v is number => v != null);
  const population = popVals.length ? popVals.reduce((a, b) => a + b, 0) : null;
  const typeList = (types as { id: string; test_name: string }[]) ?? [];
  const ecoliId = typeList.find((t) => t.test_name === ORG_ECOLI)?.id;
  const ieId = typeList.find((t) => t.test_name === ORG_IE)?.id;

  // ---- sites in the area + classification ----
  const { data: siteRows } = await supabase
    .from("test_sites")
    .select("id, name, latitude, longitude, tidal, type")
    .in("parish_id", parishIds)
    .order("name");
  const sList = (siteRows as { id: string; name: string; latitude: number | null; longitude: number | null; tidal: boolean; type: string | null }[]) ?? [];
  const siteIds = sList.map((s) => s.id);

  const perSite = new Map<string, { ecoli: number[]; ie: number[]; n: number }>();
  if (siteIds.length) {
    const { data: results } = await supabase
      .from("test_results")
      .select("result, site_id, test_type_id")
      .in("site_id", siteIds)
      .limit(10000);
    for (const r of (results as { result: number | null; site_id: string; test_type_id: string }[]) ?? []) {
      const e = perSite.get(r.site_id) ?? { ecoli: [], ie: [], n: 0 };
      e.n++;
      if (r.result != null && r.test_type_id === ecoliId) e.ecoli.push(r.result);
      if (r.result != null && r.test_type_id === ieId) e.ie.push(r.result);
      perSite.set(r.site_id, e);
    }
  }
  const sites: AreaSite[] = sList.map((s) => {
    const v = perSite.get(s.id);
    const klass = v ? worstClass(classify(v.ecoli, s.tidal, "ecoli").klass, classify(v.ie, s.tidal, "ie").klass) : "Insufficient data";
    return { id: s.id, name: s.name, lat: s.latitude, lng: s.longitude, tidal: s.tidal, type: s.type, samples: v?.n ?? 0, klass };
  });

  // ---- assets in the area + latest EDM status + latest annual spills ----
  const { data: assetRows } = await supabase
    .from("sewage_assets")
    .select("id, asset_name, asset_type, latitude, longitude, sewage_system_id, processing_capacity")
    .in("parish_id", parishIds)
    .order("asset_name");
  const aList = (assetRows as { id: string; asset_name: string; asset_type: string | null; latitude: number | null; longitude: number | null; sewage_system_id: string | null; processing_capacity: number | null }[]) ?? [];
  const assetIds = aList.map((a) => a.id);

  const latestStatus = new Map<string, number | null>();
  const latestAnnual = new Map<string, { year: number; spills: number | null }>();
  if (assetIds.length) {
    const [{ data: snaps }, { data: annual }] = await Promise.all([
      supabase.from("edm_snapshots").select("asset_id, status, captured_at").in("asset_id", assetIds).order("captured_at", { ascending: false }),
      supabase.from("edm_annual_stats").select("asset_id, year, spill_count").in("asset_id", assetIds).order("year", { ascending: false }),
    ]);
    for (const s of (snaps as { asset_id: string; status: number | null }[]) ?? []) {
      if (!latestStatus.has(s.asset_id)) latestStatus.set(s.asset_id, s.status);
    }
    for (const r of (annual as { asset_id: string; year: number; spill_count: number | null }[]) ?? []) {
      if (!latestAnnual.has(r.asset_id)) latestAnnual.set(r.asset_id, { year: r.year, spills: r.spill_count });
    }
  }
  const assets: AreaAsset[] = aList.map((a) => ({
    id: a.id,
    name: a.asset_name,
    type: a.asset_type,
    lat: a.latitude,
    lng: a.longitude,
    status: latestStatus.has(a.id) ? latestStatus.get(a.id)! : null,
    latestSpills: latestAnnual.get(a.id)?.spills ?? null,
    latestSpillYear: latestAnnual.get(a.id)?.year ?? null,
  }));

  // ---- STW capacity: demand (system) vs capacity (installed / permit / processing) ----
  const stwAssets = aList.filter((a) => a.asset_type === "sewage_treatment_works");
  const systemIds = [...new Set(stwAssets.map((a) => a.sewage_system_id).filter(Boolean))] as string[];
  const stwIds = stwAssets.map((a) => a.id);
  const demandBySystem = new Map<string, number | null>();
  const nameBySystem = new Map<string, string>();
  const permitByAsset = new Map<string, { dwf: number | null; req: number | null }>();
  const capByAsset = new Map<string, number | null>();
  if (systemIds.length) {
    const [{ data: caps }, { data: systems }] = await Promise.all([
      supabase.from("system_capacity_v").select("system_id, demand_central_m3d").in("system_id", systemIds),
      supabase.from("sewage_systems").select("id, name").in("id", systemIds),
    ]);
    for (const c of (caps as { system_id: string; demand_central_m3d: number | null }[]) ?? []) demandBySystem.set(c.system_id, c.demand_central_m3d);
    for (const s of (systems as { id: string; name: string }[]) ?? []) nameBySystem.set(s.id, s.name);
  }
  if (stwIds.length) {
    const [{ data: permits }, { data: capAssets }] = await Promise.all([
      supabase.from("asset_permits").select("asset_id, permit_dwf_m3d, required_processing_volume").in("asset_id", stwIds).order("created_at", { ascending: false }),
      supabase.from("sewage_assets").select("id, actual_capacity_m3d").in("id", stwIds),
    ]);
    for (const p of (permits as { asset_id: string; permit_dwf_m3d: number | null; required_processing_volume: number | null }[]) ?? []) {
      if (!permitByAsset.has(p.asset_id)) permitByAsset.set(p.asset_id, { dwf: p.permit_dwf_m3d, req: p.required_processing_volume });
    }
    for (const c of (capAssets as { id: string; actual_capacity_m3d: number | null }[]) ?? []) capByAsset.set(c.id, c.actual_capacity_m3d);
  }
  const stws: AreaStw[] = stwAssets.map((a) => {
    const permit = permitByAsset.get(a.id);
    const actual = capByAsset.get(a.id) ?? null;
    let capacity: number | null = actual;
    let basis: string | null = actual != null ? "installed capacity (EIR)" : null;
    if (capacity == null && permit?.dwf != null) { capacity = permit.dwf; basis = "permit DWF"; }
    if (capacity == null && permit?.req != null) { capacity = permit.req; basis = "permit (required processing)"; }
    if (capacity == null && a.processing_capacity != null) { capacity = a.processing_capacity; basis = "processing capacity"; }
    const demand = a.sewage_system_id ? demandBySystem.get(a.sewage_system_id) ?? null : null;
    const pctRemaining = capacity != null && capacity > 0 && demand != null ? Math.round((1 - demand / capacity) * 100) : null;
    return {
      id: a.id,
      name: a.asset_name,
      systemName: a.sewage_system_id ? nameBySystem.get(a.sewage_system_id) ?? null : null,
      capacity,
      capacityBasis: basis,
      demandCentral: demand,
      pctRemaining,
    };
  });

  return {
    parishNames: pRows.map((p) => p.name).sort(),
    population,
    boundaryGeojson: (boundary as string | null) ?? null,
    sites,
    assets,
    stws,
  };
}
