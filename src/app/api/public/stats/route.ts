import { NextResponse } from "next/server";
import { INSTANCE } from "@/lib/instance";
import { cachedRpc } from "@/lib/publicData";
import { derive, type BoardRow } from "@/lib/spillStatus";

export const dynamic = "force-dynamic";

// Public, read-only headline figures for embedding elsewhere — chiefly "The Dart right now" on the
// group's marketing site. Everything here is already public on /explore/spills; this just packages
// the board's own numbers so the two can never disagree:
//   - same RPC and cache entry as the board (public_spills_board for the current year, 10-min cache)
//   - same live-status rule (derive): "spilling" needs status 1 AND a feed that has reported in 24h
// If the hourly sync has stopped (no successful poll in a day) spillingNow is null and stale is true,
// so consumers fall back to their own last-known value instead of showing a misleading "0".
//
//   curl -s https://<domain>/api/public/stats | jq
//   { "spillingNow": 3, "stoppedRecently": 5, "monitorsReporting": 58, "monitorsTotal": 61,
//     "asOf": "2026-10-01T10:00:12Z", "stale": false, ... }

const SYNC_DEAD_MIN = 24 * 60; // matches the board's "pipeline down" threshold
const SYNC_STALE_MIN = 180; // hourly cadence + generous slack, as on the board

const HEADERS = {
  // Short CDN cache on top of the 10-min data cache; stale copies are fine while revalidating.
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
  // Aggregate public data, safe to read cross-origin.
  "Access-Control-Allow-Origin": "*",
};

export async function GET() {
  let rows: BoardRow[];
  try {
    rows = await cachedRpc<BoardRow>("public_spills_board", { p_year: new Date().getUTCFullYear() });
  } catch {
    return NextResponse.json({ error: "Live data temporarily unavailable" }, { status: 503, headers: HEADERS });
  }

  const nowMs = Date.now();
  const derived = rows.map((r) => derive(r, nowMs));

  // Most recent successful poll across all monitors = the sync's health (last_updated is our capture
  // time, not SWW's timestamp — see migration 0062/0077).
  const lastPoll = rows.reduce<number | null>((m, r) => {
    const t = r.last_updated ? Date.parse(r.last_updated) : null;
    return t != null && (m == null || t > m) ? t : m;
  }, null);
  const syncAgeMin = lastPoll != null ? Math.max(0, Math.round((nowMs - lastPoll) / 60000)) : null;
  const syncDead = syncAgeMin == null || syncAgeMin > SYNC_DEAD_MIN;

  const body = {
    river: INSTANCE.riverName,
    source: INSTANCE.portalName,
    url: "/explore/spills",
    spillingNow: syncDead ? null : derived.filter((d) => d.status === "spilling").length,
    stoppedRecently: syncDead ? null : derived.filter((d) => d.status === "recent").length,
    monitorsReporting: derived.filter((d) => d.feed === "reporting").length,
    monitorsTotal: rows.length,
    asOf: lastPoll != null ? new Date(lastPoll).toISOString() : null,
    stale: syncAgeMin == null || syncAgeMin > SYNC_STALE_MIN,
    generatedAt: new Date(nowMs).toISOString(),
  };

  return NextResponse.json(body, { headers: HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
