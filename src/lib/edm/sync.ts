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

/**
 * Pull the current EDM state for every EDM-enabled asset in an organisation
 * and upsert one snapshot per asset for today. Idempotent per day.
 *
 * @param db   a Supabase client (service-role for cron; org-scoped admin client also works)
 * @param organisationId
 * @param today  ISO date (YYYY-MM-DD); passed in so callers control "now".
 */
export async function syncOrgEdm(
  db: SupabaseClient<Database>,
  organisationId: string,
  today: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    assetsChecked: 0,
    snapshotsWritten: 0,
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

  const rows = outlets
    .filter((o) => byOutlet.has(o.Id))
    .map((o) => {
      if (o.status === 1) summary.spilling++;
      else if (o.status === -1) summary.offline++;
      else summary.notSpilling++;
      return {
        organisation_id: organisationId,
        asset_id: byOutlet.get(o.Id)!,
        outlet_id: o.Id,
        snapshot_date: today,
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
      .upsert(rows, { onConflict: "asset_id,snapshot_date" });
    if (upErr) summary.errors.push(`upsert: ${upErr.message}`);
    else summary.snapshotsWritten = rows.length;
  }

  return summary;
}

export function statusLabel(status: number | null | undefined): string {
  if (status === 1) return "Spilling";
  if (status === 0) return "Not spilling";
  if (status === -1) return "Monitor offline";
  return "Unknown";
}
