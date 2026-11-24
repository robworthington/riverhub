import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Fallback feed for orgs with no edm_feed_url configured (keeps pre-0087 behaviour: the SWW
// standardised feed). New orgs set their own company's feed URL on the organisations row.
const DEFAULT_EDM_FEED =
  "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query";

// The adapter kinds we can sync. 'arcgis_edm' = an ArcGIS FeatureServer /query endpoint returning the
// standard EDM outlet attributes — what SWW's feed and every National Storm Overflow Hub per-company
// API use. Other kinds (a company with a bespoke feed) can be added here later.
const SUPPORTED_FEED_KINDS = new Set(["arcgis_edm"]);

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

/**
 * Map one ArcGIS feature's attributes onto OutletAttrs, matching field names case-insensitively.
 * Every National Storm Overflow Hub per-company feed carries the same fields; only the casing differs —
 * SWW publishes camelCase (`status`, `latestEventStart`), the NSOH standard (Wessex, Thames, …) publishes
 * PascalCase (`Status`, `LatestEventStart`). Lowercasing keys before reading lets this one adapter consume
 * every company's feed, so a non-SWW river needs only config (the org's `edm_feed_url`), no new code.
 */
function normaliseOutlet(raw: Record<string, unknown>): OutletAttrs {
  const low: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) low[k.toLowerCase()] = raw[k];
  return {
    Id: (low["id"] as string) ?? "",
    status: (low["status"] as number | null) ?? null,
    statusStart: (low["statusstart"] as number | null) ?? null,
    latestEventStart: (low["latesteventstart"] as number | null) ?? null,
    latestEventEnd: (low["latesteventend"] as number | null) ?? null,
    receivingWaterCourse: (low["receivingwatercourse"] as string | null) ?? null,
    lastUpdated: (low["lastupdated"] as number | null) ?? null,
    longitude: (low["longitude"] as number | null) ?? null,
    latitude: (low["latitude"] as number | null) ?? null,
  };
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

// ArcGIS's hosted service 404s over-long GET URLs, so outlet ids are fetched in batches that stay
// well under the ~2 KB URL limit. A whole catchment's ids in one `Id IN (...)` clause tips over that
// limit once an org passes ~110 assets: Teign's sync stalled (404 → 0 snapshots) the moment the
// orphan sweep took it from 89 to 112 assets (Sept 2026). 75 ids ≈ a 1.5 KB URL, with headroom.
const OUTLET_BATCH = 75;

async function fetchOutletBatch(ids: string[], feedUrl: string): Promise<OutletAttrs[]> {
  const params = new URLSearchParams({
    where: inClause(ids),
    // `*` + case-insensitive key normalisation (normaliseOutlet): the NSOH per-company feeds share the
    // same fields but differ in casing, so we ask for everything and read keys case-insensitively rather
    // than naming SWW's exact camelCase here.
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${feedUrl}?${params.toString()}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const json = (await res.json()) as {
    features?: { attributes: Record<string, unknown> }[];
    error?: unknown;
  };
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return (json.features ?? []).map((f) => normaliseOutlet(f.attributes));
}

async function fetchOutlets(ids: string[], feedUrl: string): Promise<OutletAttrs[]> {
  if (!ids.length) return [];
  const out: OutletAttrs[] = [];
  for (let i = 0; i < ids.length; i += OUTLET_BATCH) {
    out.push(...(await fetchOutletBatch(ids.slice(i, i + OUTLET_BATCH), feedUrl)));
  }
  return out;
}

/** Truncate an ISO timestamp to the hour (one capture per asset per hour). */
function hourBucket(iso: string): string {
  return iso.slice(0, 13) + ":00:00.000Z";
}

/**
 * Every outlet in one company's feed, paged by object id (ENGLAND-ROLLOUT-PLAN.md Phase 0.2). Each
 * National Storm Overflow Hub feed holds one company's whole network (~1,300–2,500 outlets, maxRecordCount
 * 2000), so this is one or two requests per company per hour, instead of one per 75 outlets per river.
 */
async function fetchWholeFeed(feedUrl: string): Promise<OutletAttrs[]> {
  const layer = feedUrl.replace(/\/query\/?$/, "");
  const metaRes = await fetch(`${layer}?f=json`, { cache: "no-store" });
  if (!metaRes.ok) throw new Error(`ArcGIS layer HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as { objectIdField?: string; maxRecordCount?: number; error?: unknown };
  if (meta.error) throw new Error(`ArcGIS layer error: ${JSON.stringify(meta.error)}`);
  const pageSize = Math.min(meta.maxRecordCount ?? 1000, 2000);
  const out: OutletAttrs[] = [];
  for (let offset = 0, page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });
    if (meta.objectIdField) params.set("orderByFields", meta.objectIdField);
    const res = await fetch(`${layer}/query?${params.toString()}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const json = (await res.json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: unknown };
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
    const feats = json.features ?? [];
    out.push(...feats.map((f) => normaliseOutlet(f.attributes)));
    offset += feats.length;
    if (!json.exceededTransferLimit || feats.length === 0) break;
  }
  return out;
}

type OrgAssets = { orgId: string; feedUrl: string; assets: { id: string; outlet: string }[] };

const emptySummary = (): SyncSummary => ({
  assetsChecked: 0, snapshotsWritten: 0, eventsWritten: 0, spilling: 0, offline: 0, notSpilling: 0, errors: [],
});

/** Write one river's snapshots and spill events from a company's outlets (already fetched). */
async function writeOrg(
  db: SupabaseClient<Database>,
  org: OrgAssets,
  outlets: Map<string, OutletAttrs>,
  capturedIso: string,
  summary: SyncSummary,
): Promise<void> {
  const capturedAt = hourBucket(capturedIso);
  const today = capturedIso.slice(0, 10);
  const matched = org.assets
    .map((a) => ({ assetId: a.id, o: outlets.get(a.outlet) }))
    .filter((m): m is { assetId: string; o: OutletAttrs } => m.o != null);

  // --- capture-level snapshots (one per asset per hour) ---
  const rows = matched.map(({ assetId, o }) => {
    if (o.status === 1) summary.spilling++;
    else if (o.status === -1) summary.offline++;
    else summary.notSpilling++;
    return {
      organisation_id: org.orgId,
      asset_id: assetId,
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
    const { error: upErr } = await db.from("edm_snapshots").upsert(rows, { onConflict: "asset_id,captured_at" });
    if (upErr) summary.errors.push(`snapshot upsert: ${upErr.message}`);
    else summary.snapshotsWritten += rows.length;
  }

  // --- discrete spill events (reconstructed from the feed's latest event) ---
  const events = matched
    .filter(({ o }) => o.latestEventStart != null)
    .map(({ assetId, o }) => {
      const start = msToIso(o.latestEventStart)!;
      const endIso = msToIso(o.latestEventEnd);
      const ongoing = o.status === 1;
      // Only record an end once it's a real, completed end after the start.
      const event_end = !ongoing && endIso && endIso > start ? endIso : null;
      return { organisation_id: org.orgId, asset_id: assetId, outlet_id: o.Id, event_start: start, event_end, ongoing, updated_at: capturedIso };
    });
  if (events.length) {
    const { error: evErr } = await db.from("spill_events").upsert(events, { onConflict: "asset_id,event_start" });
    if (evErr) summary.errors.push(`event upsert: ${evErr.message}`);
    else summary.eventsWritten += events.length;
  }
}

/**
 * Pull the current EDM state for every EDM-enabled asset, for all rivers (or the given ones):
 *   - fetches each company's feed ONCE (rivers are grouped by their edm_feed_url),
 *   - writes one capture-level snapshot per asset (deduped to the hour), and
 *   - reconstructs discrete spill_events from the feed's latest_event_start/end.
 * If a whole-feed fetch fails, that company's rivers fall back to fetching their own outlets by id.
 * Returns one summary per river.
 */
export async function syncFleetEdm(
  db: SupabaseClient<Database>,
  capturedIso: string,
  orgIds?: string[],
): Promise<Map<string, SyncSummary>> {
  const summaries = new Map<string, SyncSummary>();

  let orgQuery = db.from("organisations").select("id, edm_feed_url, edm_feed_kind");
  if (orgIds?.length) orgQuery = orgQuery.in("id", orgIds);
  const { data: orgRows, error: orgErr } = await orgQuery;
  if (orgErr) throw new Error(`load organisations: ${orgErr.message}`);

  // EDM-enabled assets for those rivers, paged past PostgREST's 1,000-row cap.
  const ids = (orgRows ?? []).map((o) => o.id);
  const assetsByOrg = new Map<string, { id: string; outlet: string; feed: string | null }[]>();
  for (let from = 0; ids.length; from += 1000) {
    const { data, error } = await db
      .from("sewage_assets")
      .select("id, organisation_id, asset_unique_id, edm_feed_url" as "id, organisation_id, asset_unique_id")
      .in("organisation_id", ids)
      .eq("edm_enabled", true)
      .not("asset_unique_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`load assets: ${error.message}`);
    for (const a of (data ?? []) as unknown as { id: string; organisation_id: string; asset_unique_id: string | null; edm_feed_url: string | null }[]) {
      if (!a.asset_unique_id) continue;
      const list = assetsByOrg.get(a.organisation_id) ?? [];
      // the overflow's own company feed (migration 0112), else the river's
      list.push({ id: a.id, outlet: a.asset_unique_id, feed: a.edm_feed_url });
      assetsByOrg.set(a.organisation_id, list);
    }
    if (!data || data.length < 1000) break;
  }

  // Group overflows by the feed they're on: usually one feed per river, but a catchment served by two
  // companies (migration 0112) splits across two feeds, each fetched once for the whole fleet.
  const byFeed = new Map<string, OrgAssets[]>();
  for (const o of orgRows ?? []) {
    const s = emptySummary();
    summaries.set(o.id, s);
    const assets = assetsByOrg.get(o.id) ?? [];
    s.assetsChecked = assets.length;
    if (!assets.length) continue;
    const kind = o.edm_feed_kind ?? "arcgis_edm";
    if (!SUPPORTED_FEED_KINDS.has(kind)) {
      s.errors.push(`unsupported edm_feed_kind "${kind}" for org ${o.id}`);
      continue;
    }
    const orgFeed = o.edm_feed_url ?? DEFAULT_EDM_FEED;
    const perFeed = new Map<string, { id: string; outlet: string }[]>();
    for (const a of assets) {
      const f = a.feed ?? orgFeed;
      perFeed.set(f, [...(perFeed.get(f) ?? []), { id: a.id, outlet: a.outlet }]);
    }
    for (const [feedUrl, list] of perFeed) {
      byFeed.set(feedUrl, [...(byFeed.get(feedUrl) ?? []), { orgId: o.id, feedUrl, assets: list }]);
    }
  }

  for (const [feedUrl, orgs] of byFeed) {
    let outlets: Map<string, OutletAttrs> | null = null;
    try {
      outlets = new Map((await fetchWholeFeed(feedUrl)).map((o) => [o.Id, o]));
    } catch (e) {
      console.warn(`[edm-sync] whole-feed fetch failed for ${feedUrl}, falling back to per-river: ${e instanceof Error ? e.message : e}`);
    }
    // Write rivers a few at a time; the DB writes are the slow part once the feed is in hand.
    let next = 0;
    const worker = async () => {
      while (next < orgs.length) {
        const org = orgs[next++];
        const s = summaries.get(org.orgId)!;
        let source = outlets;
        if (!source) {
          try {
            source = new Map((await fetchOutlets(org.assets.map((a) => a.outlet), feedUrl)).map((o) => [o.Id, o]));
          } catch (e) {
            s.errors.push(e instanceof Error ? e.message : String(e));
            continue;
          }
        }
        await writeOrg(db, org, source, capturedIso, s);
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, orgs.length) }, worker));
  }
  return summaries;
}

/** One river's sync (the members' "Sync now" button and `?slug=`): the fleet sync scoped to one org. */
export async function syncOrgEdm(
  db: SupabaseClient<Database>,
  organisationId: string,
  capturedIso: string,
): Promise<SyncSummary> {
  try {
    return (await syncFleetEdm(db, capturedIso, [organisationId])).get(organisationId) ?? emptySummary();
  } catch (e) {
    return { ...emptySummary(), errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export function statusLabel(status: number | null | undefined): string {
  if (status === 1) return "Spilling";
  if (status === 0) return "Not spilling";
  if (status === -1) return "Monitor offline";
  return "Unknown";
}
