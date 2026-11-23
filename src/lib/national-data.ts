import { cachedRpc } from "@/lib/publicData";

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

export function nationalDistricts(): Promise<NationalDistrict[]> {
  return safe(cachedRpc<NationalDistrict>("national_districts"));
}

export async function districtDetail(slug: string): Promise<DistrictDetail | null> {
  const rows = await safe(cachedRpc<DistrictDetail>("public_district", { p_slug: slug }));
  return rows[0] ?? null;
}

/** Plain-English label for a river basin district: "South West river basin district". */
export function districtLabel(name: string): string {
  return `${name} river basin district`;
}
