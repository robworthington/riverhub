// EA / revised Bathing Water Directive (2006/7/EC) classification.
// Uses the log-normal percentile method the regulator applies: the 95th and 90th percentiles are
// estimated from the mean and standard deviation of log10(counts), then compared to thresholds
// that differ for coastal/transitional vs inland waters.
//
// NOTE: official classification is over the bathing season across 4 years with >=16 samples; here we
// pool all available samples per site, so results are *indicative* and labelled as such in the UI.

export type Analyte = "ecoli" | "ie";
export type BathingClass = "Excellent" | "Good" | "Sufficient" | "Poor" | "Insufficient data";

export const MIN_SAMPLES = 10; // below this we don't assert a class

const Z90 = 1.282;
const Z95 = 1.645;

// thresholds[water][analyte] = { excellent95, good95, sufficient90 }
const THRESHOLDS = {
  coastal: {
    ecoli: { excellent95: 250, good95: 500, sufficient90: 500 },
    ie: { excellent95: 100, good95: 200, sufficient90: 185 },
  },
  inland: {
    ecoli: { excellent95: 500, good95: 1000, sufficient90: 900 },
    ie: { excellent95: 200, good95: 400, sufficient90: 330 },
  },
} as const;

export interface ClassResult {
  n: number;
  p90: number | null;
  p95: number | null;
  klass: BathingClass;
}

function logPercentiles(values: number[]): { p90: number; p95: number } | null {
  const xs = values.filter((v) => v > 0).map((v) => Math.log10(v));
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  const sd = Math.sqrt(variance);
  return { p90: 10 ** (mean + Z90 * sd), p95: 10 ** (mean + Z95 * sd) };
}

export function classify(values: number[], tidal: boolean, analyte: Analyte): ClassResult {
  const n = values.length;
  if (n < MIN_SAMPLES) return { n, p90: null, p95: null, klass: "Insufficient data" };
  const pct = logPercentiles(values);
  if (!pct) return { n, p90: null, p95: null, klass: "Insufficient data" };
  const th = THRESHOLDS[tidal ? "coastal" : "inland"][analyte];
  const p95 = Math.round(pct.p95);
  const p90 = Math.round(pct.p90);
  let klass: BathingClass;
  if (pct.p95 <= th.excellent95) klass = "Excellent";
  else if (pct.p95 <= th.good95) klass = "Good";
  else if (pct.p90 <= th.sufficient90) klass = "Sufficient";
  else klass = "Poor";
  return { n, p90, p95, klass };
}

const ORDER: Record<BathingClass, number> = {
  Poor: 0,
  Sufficient: 1,
  Good: 2,
  Excellent: 3,
  "Insufficient data": 4,
};

/** Overall site class = the worst of the available analyte classes (ignoring insufficient ones). */
export function worstClass(...classes: BathingClass[]): BathingClass {
  const ranked = classes.filter((c) => c !== "Insufficient data").sort((a, b) => ORDER[a] - ORDER[b]);
  return ranked[0] ?? "Insufficient data";
}

export const CLASS_COLOUR: Record<BathingClass, string> = {
  Excellent: "#2563eb", // blue
  Good: "#16a34a", // green
  Sufficient: "#d97706", // amber
  Poor: "#dc2626", // red
  "Insufficient data": "#9ca3af", // grey
};
