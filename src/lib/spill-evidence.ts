import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SewageAsset, RainfallStation } from "@/lib/types";
import {
  buildRainIndex, classifySpill, dryspillConfidence, EA_THRESHOLD_MM, METHODOLOGY_VERSION,
  type WeatherClass, type ConfidenceResult,
} from "@/lib/dryspill";
import { eventDurationSeconds } from "@/lib/duration";

const WORKS_TYPES: ("sewage_treatment_works" | "storm_tank")[] = ["sewage_treatment_works", "storm_tank"];

export interface SpillEvidence {
  generatedAt: string;
  methodVersion: string;
  event: { id: string; start: string; end: string | null; ongoing: boolean; durationMinutes: number | null; durationSeconds: number | null };
  asset: { id: string; name: string; type: string | null; uniqueId: string | null; lat: number | null; lng: number | null; bathingWater: string | null; shellfishWater: string | null };
  system: string | null;
  receivingWater: string | null;
  parish: string | null;
  gauge: { name: string; eaStationId: string | null; lat: number | null; lng: number | null } | null;
  distanceKm: number | null;
  primaryClass: WeatherClass;
  windows: { days: number; klass: WeatherClass }[];
  widestDryWindowDays: number | null;
  dailyRain: { date: string; mm: number | null }[];
  flowM3s: number | null;
  annual: { year: number; spillCount: number | null; totalDurationHours: number | null; reportingPct: number | null } | null;
  isUpstream: boolean;
  aheadOfWorks: boolean | null;
  tidalCaveat: boolean;
  confidence: ConfidenceResult;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Assemble the full per-event dry-spill evidence in one place — used by both the dossier page and
 * the JSON evidence export, so a downloaded snapshot matches exactly what's on screen.
 * Returns null if the event doesn't exist or doesn't belong to assetId.
 */
export async function getSpillEvidence(
  db: SupabaseClient<Database>,
  eventId: string,
  assetId?: string,
): Promise<SpillEvidence | null> {
  const { data: ev } = await db.from("spill_events").select("*").eq("id", eventId).single();
  if (!ev || (assetId && ev.asset_id !== assetId)) return null;
  const { data: assetRow } = await db.from("sewage_assets").select("*").eq("id", ev.asset_id).single();
  if (!assetRow) return null;
  const a = assetRow as SewageAsset;

  const spillDay = (ev.event_start as string).slice(0, 10);
  const from = new Date(spillDay + "T00:00:00Z"); from.setUTCDate(from.getUTCDate() - 4);
  const fromDay = from.toISOString().slice(0, 10);
  const yr = Number(spillDay.slice(0, 4));

  const [{ data: system }, { data: wb }, { data: parish }, { data: gaugeRow }, { data: rain }, { data: flow }, { data: annual }, { data: worksAssets }] =
    await Promise.all([
      a.sewage_system_id ? db.from("sewage_systems").select("name").eq("id", a.sewage_system_id).single() : Promise.resolve({ data: null }),
      a.water_body_id ? db.from("water_bodies").select("label").eq("id", a.water_body_id).single() : Promise.resolve({ data: null }),
      a.parish_id ? db.from("parishes").select("name").eq("id", a.parish_id).single() : Promise.resolve({ data: null }),
      a.rainfall_station_id ? db.from("rainfall_stations").select("*").eq("id", a.rainfall_station_id).single() : Promise.resolve({ data: null }),
      a.rainfall_station_id ? db.from("rainfall_readings").select("reading_date, rainfall_mm").eq("station_id", a.rainfall_station_id).gte("reading_date", fromDay).lte("reading_date", spillDay).order("reading_date") : Promise.resolve({ data: [] }),
      db.from("flow_readings").select("flow_m3s").eq("reading_date", spillDay).limit(1),
      db.from("edm_annual_stats").select("spill_count, total_duration_hours, reporting_pct").eq("asset_id", ev.asset_id).eq("year", yr).limit(1),
      a.sewage_system_id ? db.from("sewage_assets").select("id").eq("sewage_system_id", a.sewage_system_id).in("asset_type", WORKS_TYPES) : Promise.resolve({ data: [] }),
    ]);

  const g = gaugeRow as RainfallStation | null;
  const distanceKm = g && a.latitude != null && a.longitude != null && g.latitude != null && g.longitude != null
    ? haversineKm(a.latitude, a.longitude, g.latitude, g.longitude) : null;

  const rainIndex = buildRainIndex((rain as { reading_date: string; rainfall_mm: number | null }[]) ?? []);
  const windows: { days: number; klass: WeatherClass }[] = [1, 3, 4].map((w) => ({
    days: w, klass: classifySpill(ev.event_start as string, rainIndex, { windowDays: w, thresholdMm: EA_THRESHOLD_MM }).weatherClass,
  }));
  const primaryClass = windows[0].klass;
  const dailyRain = classifySpill(ev.event_start as string, rainIndex, { windowDays: 4 }).days;
  const widestDryWindowDays = windows.filter((w) => w.klass === "dry").map((w) => w.days).sort((x, y) => y - x)[0] ?? null;

  const worksIds = ((worksAssets as { id: string }[]) ?? []).map((w) => w.id);
  let aheadOfWorks: boolean | null = null;
  if (worksIds.length) {
    const { count } = await db.from("spill_events").select("*", { count: "exact", head: true })
      .in("asset_id", worksIds).gte("event_start", `${spillDay}T00:00:00Z`).lt("event_start", `${spillDay}T23:59:59Z`);
    aheadOfWorks = (count ?? 0) === 0;
  }

  const annualRow = (annual as { spill_count: number | null; total_duration_hours: number | null; reporting_pct: number | null }[] | null)?.[0] ?? null;
  const receivingWater = wb ? (wb as { label: string }).label : null;
  const tidalCaveat = /estuar|tidal/i.test(`${receivingWater ?? ""} ${(system as { name: string } | null)?.name ?? ""}`);

  return {
    generatedAt: new Date().toISOString(),
    methodVersion: METHODOLOGY_VERSION,
    event: { id: ev.id as string, start: ev.event_start as string, end: ev.event_end as string | null, ongoing: ev.ongoing as boolean, durationMinutes: ev.duration_minutes as number | null, durationSeconds: eventDurationSeconds(ev.event_start as string, ev.event_end as string | null, ev.duration_minutes as number | null) },
    asset: { id: a.id, name: a.asset_name, type: a.asset_type, uniqueId: a.asset_unique_id, lat: a.latitude, lng: a.longitude, bathingWater: a.bathing_water, shellfishWater: a.shellfish_water },
    system: (system as { name: string } | null)?.name ?? null,
    receivingWater,
    parish: (parish as { name: string } | null)?.name ?? null,
    gauge: g ? { name: g.name, eaStationId: g.ea_station_id, lat: g.latitude, lng: g.longitude } : null,
    distanceKm,
    primaryClass,
    windows,
    widestDryWindowDays,
    dailyRain,
    flowM3s: (flow as { flow_m3s: number | null }[] | null)?.[0]?.flow_m3s ?? null,
    annual: annualRow ? { year: yr, spillCount: annualRow.spill_count, totalDurationHours: annualRow.total_duration_hours, reportingPct: annualRow.reporting_pct } : null,
    isUpstream: a.asset_type === "combined_sewer_overflow" || a.asset_type === "pumping_station",
    aheadOfWorks,
    tidalCaveat,
    confidence: dryspillConfidence({
      durationMinutes: ev.duration_minutes as number | null,
      widestDryWindowDays,
      gaugeDistanceKm: distanceKm,
      reportingPct: annualRow?.reporting_pct ?? null,
    }),
  };
}
