// River health: EA water-quality verdicts per river (migration 0115). Shared by the River health
// page and the works above/below pages.

export type Band = "high" | "good" | "moderate" | "poor" | "bad";
export type TestKey = "phosphate" | "ammonia" | "oxygen";

export const BANDS: Band[] = ["high", "good", "moderate", "poor", "bad"];

/** Band colours differ in lightness as well as hue, so the bar reads in greyscale too. */
export const BAND_META: Record<Band, { label: string; bg: string; fg: string; text: string }> = {
  high: { label: "High", bg: "#0d6b62", fg: "#ffffff", text: "#0d6b62" },
  good: { label: "Good", bg: "#6fb3a6", fg: "#0a2f2b", text: "#2f6f63" },
  moderate: { label: "Moderate", bg: "#e9b949", fg: "#3d2a00", text: "#7a5600" },
  poor: { label: "Poor", bg: "#c4632a", fg: "#ffffff", text: "#9a4415" },
  bad: { label: "Bad", bg: "#7d2018", fg: "#ffffff", text: "#7d2018" },
};

export const TEST_META: Record<TestKey, { title: string; unit: string; blurb: string; lowerIsBetter: boolean; digits: number }> = {
  phosphate: {
    title: "Phosphate",
    unit: "mg/l",
    blurb: "Feeds algae and weed growth. Most comes from treated sewage and farm run-off.",
    lowerIsBetter: true,
    digits: 3,
  },
  ammonia: {
    title: "Ammonia",
    unit: "mg/l",
    blurb: "Toxic to fish. High readings usually mean sewage or slurry has got into the water.",
    lowerIsBetter: true,
    digits: 3,
  },
  oxygen: {
    title: "Dissolved oxygen",
    unit: "% saturation",
    blurb: "Fish and insects need it. It falls when algae die back or pollution is broken down.",
    lowerIsBetter: false,
    digits: 0,
  },
};

export type WorstSite = { notation: string; site_label: string; mean: number; n: number; band: Band; latest: string };
export type HealthTest = {
  determinand: string; test: TestKey; unit: string; sites: number;
  high: number; good: number; moderate: number; poor: number; bad: number;
  worst: WorstSite[] | null;
};
export type RiverHealth = {
  year: number | null; from_year: number | null; clipped: boolean; sites: number;
  /** sampling points inside the outline with any test in the period (0116), even too few to band */
  points_tested?: number;
  determinands: HealthTest[];
};

export type PairTest = {
  test: TestKey; determinand: string;
  us_label: string; us_mean: number; us_n: number; us_band: Band;
  ds_label: string; ds_mean: number; ds_n: number; ds_band: Band;
  fe_label: string | null; fe_mean: number | null; fe_n: number | null;
};
export type WorksPair = { key: string; name: string; ratio: number | null; tests: PairTest[] };
export type WorksPairs = { year: number | null; from_year: number | null; works: WorksPair[] };

/** Sampling-point labels arrive in capitals ("RIVER ERME D/S IVYBRIDGE STW"); keep the EA's
 *  abbreviations readable. */
export function siteName(label: string): string {
  return label
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Stw|Wwtw|Wrc|Fe)\b/g, (w) => w.toUpperCase())
    .replace(/\bU\/s\b/g, "upstream of")
    .replace(/\bD\/s\b/g, "downstream of")
    .replace(/\bBr\b/g, "Bridge");
}

export function fmt(test: TestKey, v: number | null | undefined): string {
  if (v == null) return "–";
  return Number(v).toFixed(TEST_META[test].digits);
}

export function belowGood(t: HealthTest): number {
  return t.moderate + t.poor + t.bad;
}

/** Upper edge of each band, as in ea_wq_band() (migration 0115). Oxygen is higher-is-better, so its
 *  edges are lower limits: high ≥80, good ≥75, moderate ≥64, poor ≥50. Used to shade charts. */
export const BAND_EDGES: Record<TestKey, { high: number; good: number; moderate: number; poor: number }> = {
  phosphate: { high: 0.036, good: 0.069, moderate: 0.173, poor: 1.003 },
  ammonia: { high: 0.2, good: 0.3, moderate: 0.75, poor: 1.1 },
  oxygen: { high: 80, good: 75, moderate: 64, poor: 50 },
};

export function bandOf(test: TestKey, v: number): Band {
  const e = BAND_EDGES[test];
  if (test === "oxygen") return v >= e.high ? "high" : v >= e.good ? "good" : v >= e.moderate ? "moderate" : v >= e.poor ? "poor" : "bad";
  return v <= e.high ? "high" : v <= e.good ? "good" : v <= e.moderate ? "moderate" : v <= e.poor ? "poor" : "bad";
}

export const TEST_DETERMINAND: Record<TestKey, string> = {
  phosphate: "Orthophosphate, reactive as P",
  ammonia: "Ammoniacal Nitrogen as N",
  oxygen: "Oxygen, Dissolved, % Saturation",
};

/** Poor and bad draw as squares on the map, so the worst points stand out without relying on colour. */
export function isSquare(b: Band | null | undefined): boolean {
  return b === "poor" || b === "bad";
}

export type WqTest = { mean: number; n: number; band: Band | null };
export type WqMapPoint = {
  notation: string; site_label: string; lat: number; lng: number; latest: string;
  tests: Partial<Record<TestKey, WqTest>>;
};
export type WqMap = { year: number | null; from_year: number | null; points: WqMapPoint[] };

export type WqPointTest = { test: TestKey; determinand: string; mean: number; max: number; min: number; n: number; band: Band | null };
export type WqPoint = {
  notation: string; site_label: string; wb_name: string | null; lat: number | null; lng: number | null;
  n_samples: number; first_sample: string; latest: string; works_key: string | null; side: "us" | "ds" | null;
  year: number | null; from_year: number | null; tests: WqPointTest[];
};
export type WqSample = {
  determinand: string; unit: string | null; result: number | null; result_qualifier: string | null;
  sampled_at: string; purpose: string | null; sample_material: string | null;
};

export function periodLabel(from: number | null, to: number | null): string {
  if (!to) return "";
  return from && from !== to ? `${from}–${to}` : String(to);
}
