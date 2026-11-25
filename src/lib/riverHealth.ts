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

export function periodLabel(from: number | null, to: number | null): string {
  if (!to) return "";
  return from && from !== to ? `${from}–${to}` : String(to);
}
