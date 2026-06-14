// Dry-spill classification (see ../DRY-SPILL-METHOD.md).
// A spill is "dry" if rainfall is at/below the threshold on the spill day and on
// each of the N preceding days — i.e. not driven by the rainfall that permits require,
// so presumptively non-compliant (UWWTR 1994 Reg 4(4)). Default = the EA/Ofwat
// definition: <=0.25 mm on the day + preceding 24h (N=1).

export type WeatherClass = "dry" | "wet" | "unknown";

export const EA_THRESHOLD_MM = 0.25;
export const DEFAULT_WINDOW_DAYS = 1;

// Default minimum spill duration for the evidence views (one standard monitor interval).
// A display filter only — the EA 12/24h counts stay canonical. See DRY-SPILL-UX-PROPOSAL.md §1-2.
export const DEFAULT_MIN_SPILL_MINUTES = 15;

// Methodology link, pinned to the commit the method doc is at (bump when DRY-SPILL-METHOD.md
// changes materially) so a cited figure is reproducible against the exact method version.
export const METHODOLOGY_VERSION = "rev 7b59571";
export const METHODOLOGY_URL =
  "https://github.com/robworthington/riverhub/blob/7b59571/DRY-SPILL-METHOD.md";

// Evidence-strength rating for a dry spill (DRY-SPILL-UX-PROPOSAL.md §6, Phase C). Transparent,
// additive, and explainable (this backs advocacy, so every point must be defensible). Combines how
// solid the *dry classification* is (duration, widest antecedent-dry window, gauge proximity) with a
// data-quality gate (monitor uptime). Receptor/ahead-of-works are shown separately as impact.
export type ConfidenceLevel = "High" | "Medium" | "Low";
export interface ConfidenceResult { level: ConfidenceLevel; score: number; reasons: string[]; caveats: string[] }

export function dryspillConfidence(input: {
  durationMinutes: number | null;
  widestDryWindowDays: number | null; // 4 | 3 | 1, or null if not classed dry at any window
  gaugeDistanceKm: number | null;
  reportingPct: number | null; // annual monitor uptime for the spill's year
}): ConfidenceResult {
  const { durationMinutes: dm, widestDryWindowDays: w, gaugeDistanceKm: d, reportingPct: pct } = input;
  let score = 0;
  const reasons: string[] = [];
  const caveats: string[] = [];

  if (dm != null) {
    if (dm >= 360) { score += 2; reasons.push("Long discharge (≥6 h)"); }
    else if (dm >= 60) { score += 1; reasons.push("Sustained discharge (≥1 h)"); }
    else caveats.push("Short discharge (<1 h) — weaker signal");
  }
  if (w === 4) { score += 2; reasons.push("Dry across a 4-day antecedent window"); }
  else if (w === 3) { score += 1; reasons.push("Dry across a 3-day window"); }
  else if (w === 1) reasons.push("Dry on the EA 1-day window");
  if (d != null) {
    if (d <= 5) { score += 1; reasons.push("Rain gauge close (≤5 km)"); }
    else if (d > 15) { score -= 1; caveats.push(`Rain gauge ~${Math.round(d)} km away — less representative`); }
  }
  let capped = false;
  if (pct != null) {
    if (pct >= 90) { score += 1; reasons.push(`Monitor ${Math.round(pct)}% operational that year`); }
    else { caveats.push(`Monitor only ${Math.round(pct)}% operational that year — data may be incomplete`); capped = true; }
  }

  let level: ConfidenceLevel = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  if (capped && level === "High") level = "Medium"; // never "high" on incomplete monitoring
  return { level, score, reasons, caveats };
}

/** Map reading_date (YYYY-MM-DD) → max rainfall mm seen that day (across stations). */
export function buildRainIndex(
  readings: { reading_date: string; rainfall_mm: number | null }[],
): Map<string, number> {
  const idx = new Map<string, number>();
  for (const r of readings) {
    const mm = r.rainfall_mm ?? 0;
    const cur = idx.get(r.reading_date);
    if (cur === undefined || mm > cur) idx.set(r.reading_date, mm);
  }
  return idx;
}

/** Per-station rainfall index: stationId → (date → max mm). */
export function buildRainIndexByStation(
  readings: { station_id: string; reading_date: string; rainfall_mm: number | null }[],
): Map<string, Map<string, number>> {
  const byStation = new Map<string, Map<string, number>>();
  for (const r of readings) {
    let idx = byStation.get(r.station_id);
    if (!idx) {
      idx = new Map<string, number>();
      byStation.set(r.station_id, idx);
    }
    const mm = r.rainfall_mm ?? 0;
    const cur = idx.get(r.reading_date);
    if (cur === undefined || mm > cur) idx.set(r.reading_date, mm);
  }
  return byStation;
}

const EMPTY_INDEX = new Map<string, number>();

/** The rainfall index for an asset's mapped gauge (empty → classifications are "unknown"). */
export function indexForStation(
  byStation: Map<string, Map<string, number>>,
  stationId: string | null | undefined,
): Map<string, number> {
  return (stationId && byStation.get(stationId)) || EMPTY_INDEX;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SpillClassification {
  weatherClass: WeatherClass;
  spillDay: string;
  days: { date: string; mm: number | null }[]; // spill day first, then preceding
  maxMm: number | null; // max rainfall across the window (null if all unknown)
}

/**
 * Classify a spill event against a daily-rainfall index.
 * - "wet"  if any day in the window has rainfall > threshold (rain occurred)
 * - "dry"  if every day in the window is present in the data and <= threshold
 * - "unknown" otherwise (missing rainfall data for a window day, can't conclude dry)
 */
export function classifySpill(
  eventStartIso: string,
  rain: Map<string, number>,
  opts: { thresholdMm?: number; windowDays?: number } = {},
): SpillClassification {
  const threshold = opts.thresholdMm ?? EA_THRESHOLD_MM;
  const window = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const spillDay = eventStartIso.slice(0, 10);
  const start = new Date(spillDay + "T00:00:00Z");

  const days: { date: string; mm: number | null }[] = [];
  let anyWet = false;
  let allPresentAndDry = true;
  let maxMm: number | null = null;

  for (let i = 0; i <= window; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i);
    const key = isoDay(d);
    const mm = rain.has(key) ? rain.get(key)! : null;
    days.push({ date: key, mm });
    if (mm === null) {
      allPresentAndDry = false;
    } else {
      if (maxMm === null || mm > maxMm) maxMm = mm;
      if (mm > threshold) anyWet = true;
    }
  }

  const weatherClass: WeatherClass = anyWet ? "wet" : allPresentAndDry ? "dry" : "unknown";
  return { weatherClass, spillDay, days, maxMm };
}
