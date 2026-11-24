// WhatDoTheyKnow sync (migration 0108): read the public search feed for River Hub's requests and turn
// it into one update per request for apply_wdtk_sync().
//
// WhatDoTheyKnow has no read API, but every search has a JSON feed (help/api): a list of events (sent,
// response, follow-up…), each carrying its request's current state and tags. Request pages, request
// JSON and authority pages sit behind a Cloudflare bot check for servers, so only the search feed is
// used. Its events include the requester's name; that is never kept.
import type { InfoRequestStatus } from "@/lib/types";
import { RESPONSE_WORKING_DAYS, addWorkingDays } from "@/lib/requests";

const BASE = "https://www.whatdotheyknow.com";
export const WDTK_FEED_QUERY = "tag:riverhub";
const MAX_PAGES = 20; // 25 events a page

type FeedEvent = {
  event_type: string;
  created_at: string;
  calculated_state: string | null;
  display_status: string | null;
  info_request: {
    id: number; url_title: string; title: string; created_at: string; updated_at: string;
    described_state: string | null; display_status: string | null; law_used: string | null;
    tags: [string, string | null][];
  };
};

export type WdtkUpdate = {
  request_id: string | null; url: string; wdtk_id: number; status: InfoRequestStatus | null;
  wdtk_state: string | null; sent_on: string | null; due_on: string | null; answered_on: string | null;
  river: string | null;
};

/** WhatDoTheyKnow's states (Alaveteli described_state) in River Hub's terms. Unknown or
 *  housekeeping states (gone_postal, error_message, requires_admin…) leave the status alone. */
const STATE_MAP: Record<string, InfoRequestStatus> = {
  waiting_response: "sent",
  waiting_response_overdue: "sent",
  waiting_response_very_overdue: "sent",
  waiting_clarification: "acknowledged",
  successful: "answered",
  partially_successful: "partial",
  rejected: "refused",
  vexatious: "refused",
  not_held: "not_held",
  internal_review: "internal_review",
  user_withdrawn: "withdrawn",
};

export class WdtkBlocked extends Error {}

/** Every event in the feed for River Hub's requests, newest first. Throws WdtkBlocked if the site
 *  answers with anything other than JSON (e.g. a Cloudflare challenge). */
export async function fetchWdtkEvents(query = WDTK_FEED_QUERY): Promise<FeedEvent[]> {
  const all: FeedEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/feed/search/${encodeURIComponent(query)}.json${page > 1 ? `?page=${page}` : ""}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "RiverHub-WDTK-sync/1.0", Accept: "application/json" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("json")) throw new WdtkBlocked(`WhatDoTheyKnow answered ${res.status} ${type.split(";")[0]}`);
    const events = (await res.json()) as FeedEvent[];
    if (!Array.isArray(events) || events.length === 0) break;
    all.push(...events);
    if (events.length < 25) break;
  }
  return all;
}

const tagValue = (tags: [string, string | null][], name: string) => tags.find(([n]) => n === name)?.[1] ?? null;
const day = (iso: string) => iso.slice(0, 10);

/** One update per WhatDoTheyKnow request, from its events. */
export function toUpdates(events: FeedEvent[], holidays: Set<string>): WdtkUpdate[] {
  const byId = new Map<number, FeedEvent[]>();
  for (const e of events) {
    if (!e?.info_request?.id) continue;
    byId.set(e.info_request.id, [...(byId.get(e.info_request.id) ?? []), e]);
  }
  const out: WdtkUpdate[] = [];
  for (const [id, evs] of byId) {
    const ir = evs[0].info_request;
    const tags = ir.tags ?? [];
    const requestId = tagValue(tags, "request");
    const state = ir.described_state ?? evs[0].calculated_state ?? null;
    let status = state ? STATE_MAP[state] ?? null : null;
    const responses = evs.filter((e) => e.event_type === "response").map((e) => e.created_at).sort();
    // A reply has come but the requester hasn't classified it yet: at least acknowledged.
    if (status === "sent" && responses.length) status = "acknowledged";
    const sent = evs.filter((e) => e.event_type === "sent").map((e) => e.created_at).sort()[0] ?? ir.created_at;
    const sentOn = sent ? day(sent) : null;
    const decided = status === "answered" || status === "partial" || status === "refused" || status === "not_held";
    out.push({
      request_id: requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId.toLowerCase() : null,
      url: `${BASE}/request/${ir.url_title}`,
      wdtk_id: id,
      status,
      wdtk_state: ir.display_status ?? evs[0].display_status ?? null,
      sent_on: sentOn,
      due_on: sentOn ? addWorkingDays(sentOn, RESPONSE_WORKING_DAYS, holidays) : null,
      answered_on: decided ? day(responses.at(-1) ?? ir.updated_at) : null,
      river: tagValue(tags, "river"),
    });
  }
  return out;
}
