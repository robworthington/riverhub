// Requests already sent to WhatDoTheyKnow from River Hub's public pages (migration 0119), so a page
// shows "already asked" with a link instead of inviting a duplicate request. Found by the daily sync,
// so a request appears here the morning after it is sent.

export type PublicAsk = {
  topic: string; url: string; status: string | null; wdtk_state: string | null;
  sent_on: string | null; answered_on: string | null;
};

export const PERMITS_TOPIC = "permits";
export const incidentTopic = (notId: number | string) => `incident-${notId}`;

export function asksByTopic(rows: PublicAsk[]): Map<string, PublicAsk> {
  return new Map(rows.map((r) => [r.topic, r]));
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Asked on 4 Dec 2026 · Awaiting response" */
export function askedText(a: PublicAsk): string {
  const when = a.sent_on ? `Asked on ${fmt(a.sent_on)}` : "Already asked";
  return a.wdtk_state ? `${when} · ${a.wdtk_state}` : when;
}
