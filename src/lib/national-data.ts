import { cachedRpc } from "@/lib/publicData";
import { coverageName } from "@/lib/nation";

/** One live river, as national_rivers() returns it (migration 0094). */
export type NationalRiver = {
  slug: string;
  river_name: string;
  region: string | null;
  org_name: string | null;
  overflows: number;
  gaps: number;
  dry: number;
  hours_lfy: number;
  logo_url: string | null;
  company_name: string | null;
  district_slug: string | null;
  district_name: string | null;
  lat: number | null;
  lng: number | null;
  /** Live counts from the hourly refresh (migration 0097); absent before it is applied. */
  spilling_now?: number;
  stopped_48h?: number;
  /** "england" or "wales" (migration 0135); absent before it is applied. */
  nation?: string | null;
  river_name_cy?: string | null;
};

/** One river basin district with totals over its live rivers (national_districts()). */
export type NationalDistrict = {
  slug: string;
  name: string;
  rivers: number;
  overflows: number;
  gaps: number;
  dry: number;
  companies: string[];
};

/** One district's totals and outline (public_district()). */
export type DistrictDetail = NationalDistrict & {
  hours_lfy: number;
  baseline_spills: number;
  latest_spills: number;
  boundary: string | null;
};

// Cached 10 minutes like the other national reads: the rollup behind them refreshes hourly. A failed
// read returns empty (the callers render their empty state) rather than breaking the page.
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

export function nationalRivers(district?: string): Promise<NationalRiver[]> {
  return safe(cachedRpc<NationalRiver>("national_rivers", district ? { p_district: district } : {}));
}

/** How national pages name their coverage: "England", or "England and Wales" once a Welsh river is
 *  live. Worked out from the live rivers, so it changes by itself when Wales goes live. */
export async function nationalCoverage(): Promise<string> {
  const rivers = await nationalRivers();
  return coverageName(rivers.map((r) => r.nation ?? "england"));
}

export function nationalDistricts(): Promise<NationalDistrict[]> {
  return safe(cachedRpc<NationalDistrict>("national_districts"));
}

export async function districtDetail(slug: string): Promise<DistrictDetail | null> {
  const rows = await safe(cachedRpc<DistrictDetail>("public_district", { p_slug: slug }));
  return rows[0] ?? null;
}

/** A neighbouring river (public_river_neighbours(), migration 0096). */
export type RiverNeighbour = { slug: string; river_name: string; gaps: number; overflows: number; distance_km: number };

/** The live rivers next to this one, nearest first (closest overflows). */
export function riverNeighbours(slug: string, limit = 3): Promise<RiverNeighbour[]> {
  return safe(cachedRpc<RiverNeighbour>("public_river_neighbours", { p_slug: slug, p_limit: limit }));
}

/** Every figure the home page shows, in one row (national_home(), migration 0097). */
export type NationalHome = {
  rivers: number; overflows: number; gaps: number; dry: number; hours_lfy: number;
  baseline_spills: number; latest_spills: number; pre_stw: number;
  spilling_now: number; rivers_spilling: number; stopped_48h: number; monitors: number; reporting: number;
  live_as_of: string | null; winep_actions: number; winep_due_2030: number;
  bathing_waters: number; shellfish_waters: number; overflows_to_bathing: number;
};

/** A district outline for the England map, with live totals (national_district_shapes()). */
export type DistrictShape = {
  slug: string; name: string; rivers: number; spilling_now: number; gaps: number; dry: number;
  lat: number; lng: number; boundary: string;
};

/** Plain-English label for a river basin district: "South West river basin district". */
export function districtLabel(name: string): string {
  return `${name} river basin district`;
}

/** One live river's serious sewage pollution incidents (national_incident_totals(), migration 0106).
 *  The same set its own Pollution incidents page lists, so England, districts and rivers agree. */
export type IncidentTotal = {
  slug: string; river_name: string; district_slug: string | null; district_name: string | null;
  incidents: number; since_2020: number; major: number; first_on: string | null; latest_on: string | null;
};

export function incidentTotals(district?: string): Promise<IncidentTotal[]> {
  return safe(cachedRpc<IncidentTotal>("national_incident_totals", district ? { p_district: district } : {}));
}

/** Sum a set of rivers' incident totals; firstYear is the earliest record among them. */
export function sumIncidents(rows: IncidentTotal[]): { incidents: number; since2020: number; major: number; firstYear: string | null } {
  let first: string | null = null;
  const t = { incidents: 0, since2020: 0, major: 0 };
  for (const r of rows) {
    t.incidents += r.incidents;
    t.since2020 += r.since_2020;
    t.major += r.major;
    if (r.first_on && (!first || r.first_on < first)) first = r.first_on;
  }
  return { ...t, firstYear: first ? first.slice(0, 4) : null };
}
