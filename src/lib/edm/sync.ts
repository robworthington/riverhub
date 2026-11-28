import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Fallback feed for orgs with no edm_feed_url configured (keeps pre-0087 behaviour: the SWW
// standardised feed). New orgs set their own company's feed URL on the organisations row.
const DEFAULT_EDM_FEED =
  "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query";

// The adapter kinds we can sync:
//   'arcgis_edm' = an ArcGIS FeatureServer returning the standard EDM outlet attributes — SWW's feed and
//                  every National Storm Overflow Hub per-company API in England.
//   'dcww_edm'   = Dŵr Cymru Welsh Water's own storm overflow map layer (Spill_Prod__External), which has
//                  its own fields: DCWW_ID, a text status, and start/stop times as UK local-time strings.
type FeedKind = "arcgis_edm" | "dcww_edm";
const SUPPORTED_FEED_KINDS = new Set<string>(["arcgis_edm", "dcww_edm"]);

// A feed's kind follows the feed, not the river: a border river can carry overflows on an English and a
// Welsh feed at once (migration 0112's per-asset edm_feed_url). Known bespoke feeds are recognised by URL;
// anything else uses the river's edm_feed_kind.
const DCWW_FEED = /\/Spill_Prod__External\/FeatureServer\//i;
function feedKind(feedUrl: string, orgKind: string): string {
  return DCWW_FEED.test(feedUrl) ? "dcww_edm" : orgKind;
}

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

/** Milliseconds for a UK wall-clock time ("2026-11-28T07:30:00", Europe/London, GMT or BST). */
export function londonToMs(local: string | null | undefined): number | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // London's offset from UTC at that moment (0 or +1 h), read from the platform's tz data
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  return asUtc - offset(asUtc - offset(asUtc));
}

/**
 * Map a Dŵr Cymru feature onto OutletAttrs. Status is text:
 *   "Overflow Operating" → 1 (spilling)
 *   "Overflow Not Operating", "Overflow Not Operating (Has in the last 24 hours)" → 0
 *   "Under Investigation" (monitor fault or data being checked) → -1 (monitor offline)
 * Times are UK local strings; EditDate is when DCWW last updated the row. DCWW rewrites a row only when
 * that outlet changes, so a quiet outlet's EditDate can be days old while the feed itself is current;
 * the sync therefore raises lastUpdated to the layer's own last data edit (FeedAdapter.feedFreshness).
 */
export function normaliseDcwwOutlet(raw: Record<string, unknown>, geom?: { x?: number; y?: number } | null): OutletAttrs {
  const text = String(raw["status"] ?? "").toLowerCase();
  const status = text.startsWith("overflow operating") ? 1
    : text.startsWith("overflow not operating") ? 0
    : text.includes("investigation") ? -1
    : null;
  const start = londonToMs(raw["start_date_time_discharge"] as string | null);
  const stop = londonToMs(raw["stop_date_time_discharge"] as string | null);
  return {
    Id: (raw["DCWW_ID"] as string) ?? "",
    status,
    statusStart: status === 1 ? start : status === 0 ? stop : null,
    latestEventStart: start,
    latestEventEnd: status === 1 ? null : stop,
    receivingWaterCourse: (raw["Receiving_Water"] as string | null) ?? null,
    lastUpdated: (raw["EditDate"] as number | null) ?? null,
    longitude: geom?.x ?? null,
    latitude: geom?.y ?? null,
  };
}

interface FeedAdapter {
  idField: string;
  /** DCWW carries no lon/lat attributes, so ask for the point in WGS84 */
  geometry: boolean;
  normalise: (attrs: Record<string, unknown>, geom?: { x?: number; y?: number } | null) => OutletAttrs;
  /** Each outlet is as fresh as the layer's last data edit (DCWW only rewrites rows that change). The
   *  NSOH feeds stamp every outlet on each refresh, so they don't need it. */
  feedFreshness: boolean;
}
const ADAPTERS: Record<FeedKind, FeedAdapter> = {
  arcgis_edm: { idField: "Id", geometry: false, normalise: (a) => normaliseOutlet(a), feedFreshness: false },
  dcww_edm: { idField: "DCWW_ID", geometry: true, normalise: normaliseDcwwOutlet, feedFreshness: true },
};

/** A feed's last data edit, from the layer's editingInfo (ms), or null when the layer doesn't say. */
export function layerDataEdited(meta: { editingInfo?: { dataLastEditDate?: number; lastEditDate?: number } }): number | null {
  return meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate ?? null;
}

/** Raise each outlet's lastUpdated to the feed's last data edit (never lowers it). If the company's
 *  whole feed stops updating, that time stops too and every outlet goes stale, as it should. */
export function withFeedFreshness(outlets: OutletAttrs[], feedEdited: number | null): OutletAttrs[] {
  if (feedEdited == null) return outlets;
  return outlets.map((o) => ({ ...o, lastUpdated: Math.max(o.lastUpdated ?? 0, feedEdited) }));
}

async function feedEditedAt(feedUrl: string): Promise<number | null> {
  const res = await fetch(`${layerOf(feedUrl)}?f=json`, { cache: "no-store" });
  if (!res.ok) return null;
  return layerDataEdited((await res.json()) as { editingInfo?: { dataLastEditDate?: number } });
}
const layerOf = (feedUrl: string) => feedUrl.replace(/\/query\/?$/, "");
type Feature = { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number } | null };

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
function inClause(ids: string[], field = "Id"): string {
  const safe = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  return `${field} IN (${safe})`;
}

// ArcGIS's hosted service 404s over-long GET URLs, so outlet ids are fetched in batches that stay
// well under the ~2 KB URL limit. A whole catchment's ids in one `Id IN (...)` clause tips over that
// limit once an org passes ~110 assets: Teign's sync stalled (404 → 0 snapshots) the moment the
// orphan sweep took it from 89 to 112 assets (Sept 2026). 75 ids ≈ a 1.5 KB URL, with headroom.
const OUTLET_BATCH = 75;

async function fetchOutletBatch(ids: string[], feedUrl: string, ad: FeedAdapter): Promise<OutletAttrs[]> {
  const params = new URLSearchParams({
    where: inClause(ids, ad.idField),
    // `*` + case-insensitive key normalisation (normaliseOutlet): the NSOH per-company feeds share the
    // same fields but differ in casing, so we ask for everything and read keys case-insensitively rather
    // than naming SWW's exact camelCase here.
    outFields: "*",
    returnGeometry: String(ad.geometry),
    f: "json",
  });
  if (ad.geometry) params.set("outSR", "4326");
  const res = await fetch(`${layerOf(feedUrl)}/query?${params.toString()}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const json = (await res.json()) as { features?: Feature[]; error?: unknown };
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return (json.features ?? []).map((f) => ad.normalise(f.attributes, f.geometry));
}

async function fetchOutlets(ids: string[], feedUrl: string, ad: FeedAdapter): Promise<OutletAttrs[]> {
  if (!ids.length) return [];
  const out: OutletAttrs[] = [];
  for (let i = 0; i < ids.length; i += OUTLET_BATCH) {
    out.push(...(await fetchOutletBatch(ids.slice(i, i + OUTLET_BATCH), feedUrl, ad)));
  }
  return ad.feedFreshness ? withFeedFreshness(out, await feedEditedAt(feedUrl)) : out;
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
async function fetchWholeFeed(feedUrl: string, ad: FeedAdapter): Promise<OutletAttrs[]> {
  const layer = layerOf(feedUrl);
  const metaRes = await fetch(`${layer}?f=json`, { cache: "no-store" });
  if (!metaRes.ok) throw new Error(`ArcGIS layer HTTP ${metaRes.status}`);
  const meta = (await metaRes.json()) as {
    objectIdField?: string; maxRecordCount?: number; error?: unknown; editingInfo?: { dataLastEditDate?: number };
  };
  if (meta.error) throw new Error(`ArcGIS layer error: ${JSON.stringify(meta.error)}`);
  const pageSize = Math.min(meta.maxRecordCount ?? 1000, 2000);
  const out: OutletAttrs[] = [];
  for (let offset = 0, page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: String(ad.geometry),
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });
    if (ad.geometry) params.set("outSR", "4326");
    if (meta.objectIdField) params.set("orderByFields", meta.objectIdField);
    const res = await fetch(`${layer}/query?${params.toString()}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const json = (await res.json()) as { features?: Feature[]; exceededTransferLimit?: boolean; error?: unknown };
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
    const feats = json.features ?? [];
    out.push(...feats.map((f) => ad.normalise(f.attributes, f.geometry)));
    offset += feats.length;
    if (!json.exceededTransferLimit || feats.length === 0) break;
  }
  return ad.feedFreshness ? withFeedFreshness(out, layerDataEdited(meta)) : out;
}

type OrgAssets = { orgId: string; feedUrl: string; kind: FeedKind; assets: { id: string; outlet: string }[] };

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
    const orgKind = o.edm_feed_kind ?? "arcgis_edm";
    const orgFeed = o.edm_feed_url ?? DEFAULT_EDM_FEED;
    const perFeed = new Map<string, { id: string; outlet: string }[]>();
    for (const a of assets) {
      const f = a.feed ?? orgFeed;
      perFeed.set(f, [...(perFeed.get(f) ?? []), { id: a.id, outlet: a.outlet }]);
    }
    for (const [feedUrl, list] of perFeed) {
      const kind = feedKind(feedUrl, orgKind);
      if (!SUPPORTED_FEED_KINDS.has(kind)) {
        s.errors.push(`unsupported edm_feed_kind "${kind}" for org ${o.id}`);
        continue;
      }
      byFeed.set(feedUrl, [...(byFeed.get(feedUrl) ?? []), { orgId: o.id, feedUrl, kind: kind as FeedKind, assets: list }]);
    }
  }

  for (const [feedUrl, orgs] of byFeed) {
    const ad = ADAPTERS[orgs[0].kind];
    let outlets: Map<string, OutletAttrs> | null = null;
    try {
      outlets = new Map((await fetchWholeFeed(feedUrl, ad)).map((o) => [o.Id, o]));
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
            source = new Map((await fetchOutlets(org.assets.map((a) => a.outlet), feedUrl, ad)).map((o) => [o.Id, o]));
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
