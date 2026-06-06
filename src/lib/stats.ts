export interface Stats {
  count: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
}

export function computeStats(values: number[]): Stats {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { count: 0, mean: null, median: null, sd: null, min: null, max: null, range: null };
  const sum = v.reduce((s, x) => s + x, 0);
  const mean = sum / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const min = v[0];
  const max = v[n - 1];
  return {
    count: n,
    mean: round(mean),
    median: round(median),
    sd: round(sd),
    min: round(min),
    max: round(max),
    range: round(max - min),
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Pull the first numeric value out of a threshold string like "≤500 CFU/100mL". */
export function parseThreshold(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = s.match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}
