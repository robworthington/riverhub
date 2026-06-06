import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

const BASE = "https://environment.data.gov.uk/hydrology/id/measures";

export interface EaSyncSummary {
  gauges: number;
  rainfallStations: number;
  flowRows: number;
  rainfallRows: number;
  errors: string[];
}

interface Reading {
  date?: string;
  dateTime?: string;
  value?: number | null;
}

async function fetchReadings(measure: string, fromDate: string): Promise<Reading[]> {
  const params = new URLSearchParams({ "min-date": fromDate, _limit: "500" });
  const res = await fetch(`${BASE}/${encodeURIComponent(measure)}/readings?${params}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`EA HTTP ${res.status} for ${measure}`);
  const json = (await res.json()) as { items?: Reading[] };
  return json.items ?? [];
}

const dateOf = (r: Reading): string | null =>
  (r.date ?? r.dateTime ?? "").slice(0, 10) || null;

/**
 * Pull recent EA readings for an organisation's gauges + rainfall stations
 * and upsert daily rows. Idempotent per (station/gauge, date).
 */
export async function syncOrgEa(
  db: SupabaseClient<Database>,
  organisationId: string,
  fromDate: string,
): Promise<EaSyncSummary> {
  const summary: EaSyncSummary = {
    gauges: 0,
    rainfallStations: 0,
    flowRows: 0,
    rainfallRows: 0,
    errors: [],
  };

  // ---- River flow gauges ----
  const { data: gauges } = await db
    .from("river_gauges")
    .select("id, ea_measure_flow, ea_measure_level")
    .eq("organisation_id", organisationId)
    .eq("ea_enabled", true);

  for (const g of gauges ?? []) {
    summary.gauges++;
    const byDate = new Map<string, { flow_m3s?: number | null; level_m?: number | null }>();
    try {
      if (g.ea_measure_flow) {
        for (const r of await fetchReadings(g.ea_measure_flow, fromDate)) {
          const d = dateOf(r);
          if (d) byDate.set(d, { ...byDate.get(d), flow_m3s: r.value ?? null });
        }
      }
      if (g.ea_measure_level) {
        for (const r of await fetchReadings(g.ea_measure_level, fromDate)) {
          const d = dateOf(r);
          if (d) byDate.set(d, { ...byDate.get(d), level_m: r.value ?? null });
        }
      }
    } catch (e) {
      summary.errors.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    const rows = [...byDate.entries()].map(([reading_date, v]) => ({
      organisation_id: organisationId,
      gauge_id: g.id,
      reading_date,
      flow_m3s: v.flow_m3s ?? null,
      level_m: v.level_m ?? null,
    }));
    if (rows.length) {
      const { error } = await db.from("flow_readings").upsert(rows, { onConflict: "gauge_id,reading_date" });
      if (error) summary.errors.push(`flow upsert: ${error.message}`);
      else summary.flowRows += rows.length;
    }
  }

  // ---- Rainfall stations ----
  const { data: stations } = await db
    .from("rainfall_stations")
    .select("id, ea_measure_rainfall")
    .eq("organisation_id", organisationId)
    .eq("ea_enabled", true);

  for (const s of stations ?? []) {
    summary.rainfallStations++;
    if (!s.ea_measure_rainfall) continue;
    let readings: Reading[];
    try {
      readings = await fetchReadings(s.ea_measure_rainfall, fromDate);
    } catch (e) {
      summary.errors.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    const rows = readings
      .map((r) => ({ d: dateOf(r), v: r.value ?? null }))
      .filter((x): x is { d: string; v: number | null } => !!x.d)
      .map((x) => ({
        organisation_id: organisationId,
        station_id: s.id,
        reading_date: x.d,
        rainfall_mm: x.v,
      }));
    if (rows.length) {
      const { error } = await db
        .from("rainfall_readings")
        .upsert(rows, { onConflict: "station_id,reading_date" });
      if (error) summary.errors.push(`rainfall upsert: ${error.message}`);
      else summary.rainfallRows += rows.length;
    }
  }

  return summary;
}
