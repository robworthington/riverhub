import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

const ARCGIS_URL =
  "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query";

interface OutletAttrs {
  Id: string;
  status: number | null;
  statusStart: number | null;
  latestEventStart: number | null;
  latestEventEnd: number | null;
  receivingWaterCourse: string | null;
  lastUpdated: number | null;
  longitude: number | null;
  latitude: number | null;
}

export interface SyncSummary {
  assetsChecked: number;
  snapshotsWritten: number;
  eventsWritten: number;
  spilling: number;
  offline: number;
  notSpilling: number;
  errors: string[];
}

const msToIso = (ms: number | null | undefined): string | null =>
  ms == null ? null : new Date(ms).toISOString();

/** Quote + comma-join outlet ids for an ArcGIS SQL `IN (...)` clause. */
function inClause(ids: string[]): string {
  const safe = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  return `Id IN (${safe})`;
}

async function fetchOutlets(ids: string[]): Promise<OutletAttrs[]> {
  if (!ids.length) return [];
  const params = new URLSearchParams({
    where: inClause(ids),
    outFields:
      "Id,status,statusStart,latestEventStart,latestEventEnd,receivingWaterCourse,lastUpdated,longitude,latitude",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${ARCGIS_URL}?${params.toString()}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const json = (await res.json()) as { features?: { attributes: OutletAttrs }[]; error?: unknown };
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return (json.features ?? []).map((f) => f.attributes);
}

/** Truncate an ISO timestamp to the hour (one capture per asset per hour). */
function hourBucket(iso: string): string {
  return iso.slice(0, 13) + ":00:00.000Z";
}

/**
 * Pull the current EDM state for every EDM-enabled asset in an organisation:
 *   - writes one capture-level snapshot per asset (deduped to the hour), and
 *   - reconstructs discrete spill_events from the feed's latest_event_start/end.
 *
 * @param db        Supabase client (service-role for cron; org-scoped admin also works)
 * @param organisationId
 * @param capturedIso  ISO timestamp for this capture (the cron passes "now").
 */
export async function syncOrgEdm(
  db: SupabaseClient<Database>,
  organisationId: string,
  capturedIso: string,
): Promise<SyncSummary> {
  const capturedAt = hourBucket(capturedIso);
  const today = capturedIso.slice(0, 10);
  const summary: SyncSummary = {
    assetsChecked: 0,
    snapshotsWritten: 0,
    eventsWritten: 0,
    spilling: 0,
    offline: 0,
    notSpilling: 0,
    errors: [],
  };

  const { data: assets, error } = await db
    .from("sewage_assets")
    .select("id, asset_unique_id")
    .eq("organisation_id", organisationId)
    .eq("edm_enabled", true)
    .not("asset_unique_id", "is", null);

  if (error) {
    summary.errors.push(`load assets: ${error.message}`);
    return summary;
  }

  const list = (assets ?? []).filter((a) => a.asset_unique_id);
  summary.assetsChecked = list.length;
  if (!list.length) return summary;

  const byOutlet = new Map(list.map((a) => [a.asset_unique_id as string, a.id]));

  let outlets: OutletAttrs[];
  try {
    outlets = await fetchOutlets([...byOutlet.keys()]);
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : String(e));
    return summary;
  }

  const matched = outlets.filter((o) => byOutlet.has(o.Id));

  // --- capture-level snapshots (one per asset per hour) ---
  const rows = matched.map((o) => {
    if (o.status === 1) summary.spilling++;
    else if (o.status === -1) summary.offline++;
    else summary.notSpilling++;
    return {
      organisation_id: organisationId,
      asset_id: byOutlet.get(o.Id)!,
      outlet_id: o.Id,
      snapshot_date: today,
      captured_at: capturedAt,
      status: o.status,
      status_start: msToIso(o.statusStart),
      latest_event_start: msToIso(o.latestEventStart),
      latest_event_end: msToIso(o.latestEventEnd),
      receiving_water_course: o.receivingWaterCourse,
      last_updated: msToIso(o.lastUpdated),
      longitude: o.longitude,
      latitude: o.latitude,
    };
  });

  if (rows.length) {
    const { error: upErr } = await db
      .from("edm_snapshots")
      .upsert(rows, { onConflict: "asset_id,captured_at" });
    if (upErr) summary.errors.push(`snapshot upsert: ${upErr.message}`);
    else summary.snapshotsWritten = rows.length;
  }

  // --- discrete spill events (reconstructed from the feed's latest event) ---
  const events = matched
    .filter((o) => o.latestEventStart != null)
    .map((o) => {
      const start = msToIso(o.latestEventStart)!;
      const endIso = msToIso(o.latestEventEnd);
      const ongoing = o.status === 1;
      // Only record an end once it's a real, completed end after the start.
      const event_end = !ongoing && endIso && endIso > start ? endIso : null;
      return {
        organisation_id: organisationId,
        asset_id: byOutlet.get(o.Id)!,
        outlet_id: o.Id,
        event_start: start,
        event_end,
        ongoing,
        updated_at: capturedIso,
      };
    });

  if (events.length) {
    const { error: evErr } = await db
      .from("spill_events")
      .upsert(events, { onConflict: "asset_id,event_start" });
    if (evErr) summary.errors.push(`event upsert: ${evErr.message}`);
    else summary.eventsWritten = events.length;
  }

  return summary;
}

export function statusLabel(status: number | null | undefined): string {
  if (status === 1) return "Spilling";
  if (status === 0) return "Not spilling";
  if (status === -1) return "Monitor offline";
  return "Unknown";
}
