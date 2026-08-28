// Derive live-status + feed-health semantics for the public spills board, from a public_spills_board
// row. Shared by the server (stat cards, spilling-now panel) and the client table so they never
// disagree. Cadence is hourly (PUBLIC-SITE-REDESIGN.md decision 2), so "reporting" allows ~2h.

export type BoardRow = {
  asset_id: string;
  asset_name: string;
  asset_code: string | null;
  asset_type: string | null;
  system_id: string | null;
  system_name: string | null;
  status: number | null;
  status_start: string | null;
  latest_event_start: string | null;
  latest_event_end: string | null;
  last_updated: string | null;
  dry: number;
  wet: number;
  total: number;
  pre_stw: number;
};

export type LiveStatus = "spilling" | "recent" | "ok" | "nodata";
export type FeedHealth = "reporting" | "quiet" | "nodata";

const HOUR = 3_600_000;
const RECENT_MS = 48 * HOUR;
const REPORTING_MS = 2 * HOUR; // hourly cadence + slack
const FEED_DEAD_MS = 24 * HOUR;

export type Derived = {
  status: LiveStatus;
  feed: FeedHealth;
  feedAgeMin: number | null;
  spillMinutes: number | null; // when spilling
  stoppedMinutes: number | null; // when recently stopped
};

export function derive(row: BoardRow, nowMs: number): Derived {
  const upd = row.last_updated ? Date.parse(row.last_updated) : null;
  const feedAgeMs = upd != null ? nowMs - upd : null;
  const feed: FeedHealth =
    feedAgeMs == null || feedAgeMs > FEED_DEAD_MS ? "nodata" : feedAgeMs <= REPORTING_MS ? "reporting" : "quiet";

  const end = row.latest_event_end ? Date.parse(row.latest_event_end) : null;
  let status: LiveStatus;
  if (feed === "nodata") status = "nodata";
  else if (row.status === 1) status = "spilling";
  else if (end != null && nowMs - end <= RECENT_MS) status = "recent";
  else status = "ok";

  const start = row.status_start ?? row.latest_event_start;
  const spillMinutes = status === "spilling" && start ? Math.max(0, Math.round((nowMs - Date.parse(start)) / 60000)) : null;
  const stoppedMinutes = status === "recent" && end != null ? Math.max(0, Math.round((nowMs - end) / 60000)) : null;

  return { status, feed, feedAgeMin: feedAgeMs != null ? Math.round(feedAgeMs / 60000) : null, spillMinutes, stoppedMinutes };
}

// Fixed board sort: spilling → recent → feed problems → rest; then dry desc, then total desc.
const RANK: Record<LiveStatus, number> = { spilling: 0, recent: 1, nodata: 2, ok: 3 };
export function boardSort(a: BoardRow, b: BoardRow, nowMs: number): number {
  const da = derive(a, nowMs);
  const db = derive(b, nowMs);
  const fa = da.status === "ok" && da.feed !== "reporting" ? 2.5 : RANK[da.status];
  const fb = db.status === "ok" && db.feed !== "reporting" ? 2.5 : RANK[db.status];
  return fa - fb || b.dry - a.dry || b.total - a.total;
}

// --- formatting ---
export function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtAge(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)} days`;
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Overflow type label from the WaSC asset code / type. */
export function overflowKind(code: string | null, type: string | null): string {
  const c = code ?? "";
  if (/_CSO_/i.test(c) || type === "combined_sewer_overflow") return "Combined sewer overflow";
  if (/PSCSO|_PS_/i.test(c) || type === "pumping_station") return "Pumping station overflow";
  if (/_SO_|_SSO_/i.test(c) || type === "sewage_treatment_works" || type === "storm_tank")
    return "Storm overflow at the works";
  return "Storm overflow";
}
