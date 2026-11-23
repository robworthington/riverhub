// EIR / FOI request log: shared vocabulary, templates and deadline arithmetic (migration 0098).
// Used by the members' Requests pages; the public side will read published requests through
// public_info_requests().
import type { InfoRequestLaw, InfoRequestLayer, InfoRequestStatus } from "@/lib/types";

// ---------- vocabulary ----------

export const STATUS_LABEL: Record<InfoRequestStatus, string> = {
  draft: "Draft",
  sent: "Awaiting reply",
  acknowledged: "Acknowledged",
  extended: "Extended",
  answered: "Answered",
  partial: "Partly answered",
  refused: "Refused",
  not_held: "Not held",
  internal_review: "Internal review",
  ico: "With the ICO",
  withdrawn: "Withdrawn",
};

/** Statuses where a reply is still owed by the authority (the deadline matters). */
export const OPEN_STATUSES: InfoRequestStatus[] = ["sent", "acknowledged", "extended", "internal_review"];
/** Statuses that end the request (a reply, or a decision to stop). */
export const CLOSED_STATUSES: InfoRequestStatus[] = ["answered", "partial", "refused", "not_held", "withdrawn"];

export const LAYER_LABEL: Record<InfoRequestLayer, string> = {
  permits: "Permits (capacity)",
  emergency_overflows: "Emergency overflows",
  incidents: "Pollution incidents",
  flow_spill: "Flow and spill data",
  capacity: "Capacity figures",
  other: "Other",
};

export const LAW_LABEL: Record<InfoRequestLaw, string> = {
  eir: "Environmental Information Regulations 2004",
  foi: "Freedom of Information Act 2000",
};

// ---------- authorities ----------

/** Public bodies a river group is likely to ask, with their WhatDoTheyKnow page (url_name checked
 *  against whatdotheyknow.com/body/<slug>.json on 23 Nov 2026). Water companies are covered by EIR
 *  only (Fish Legal v ICO, 2015), so requests to them must be for environmental information. */
export type Authority = { slug: string; name: string; kind: "regulator" | "water_company"; law: InfoRequestLaw };

export const AUTHORITIES: Authority[] = [
  { slug: "environment_agency", name: "Environment Agency", kind: "regulator", law: "eir" },
  { slug: "ofwat", name: "Ofwat", kind: "regulator", law: "foi" },
  { slug: "natural_england", name: "Natural England", kind: "regulator", law: "eir" },
  { slug: "anglian_water", name: "Anglian Water", kind: "water_company", law: "eir" },
  { slug: "hafren_dyfrdwy", name: "Hafren Dyfrdwy", kind: "water_company", law: "eir" },
  { slug: "northumbrian_water", name: "Northumbrian Water", kind: "water_company", law: "eir" },
  { slug: "severn_trent_water", name: "Severn Trent Water", kind: "water_company", law: "eir" },
  { slug: "south_west_water", name: "South West Water", kind: "water_company", law: "eir" },
  { slug: "southern_water", name: "Southern Water", kind: "water_company", law: "eir" },
  { slug: "thames_water", name: "Thames Water", kind: "water_company", law: "eir" },
  { slug: "united_utilities", name: "United Utilities", kind: "water_company", law: "eir" },
  { slug: "welsh_water", name: "Welsh Water", kind: "water_company", law: "eir" },
  { slug: "wessex_water", name: "Wessex Water", kind: "water_company", law: "eir" },
  { slug: "yorkshire_water", name: "Yorkshire Water", kind: "water_company", law: "eir" },
];

/** The WhatDoTheyKnow authority for a river's water company name ("South West Water" → south_west_water). */
export function companyAuthority(companyName: string | null | undefined): Authority | null {
  if (!companyName) return null;
  const k = companyName.toLowerCase().replace(/[^a-z]/g, "");
  return AUTHORITIES.find((a) => a.kind === "water_company" && k.startsWith(a.name.toLowerCase().replace(/[^a-z]/g, ""))) ?? null;
}

export function authorityBySlug(slug: string | null | undefined): Authority | null {
  return AUTHORITIES.find((a) => a.slug === slug) ?? null;
}

// ---------- templates ----------

export type TemplateContext = {
  river: string;          // "River Teign"
  company: string;        // "South West Water"
  assets: string[];       // names of the overflows / works the request is about
};

export type RequestTemplate = {
  key: string;
  label: string;
  layer: InfoRequestLayer;
  /** "company" = the river's water company; otherwise an authority slug. */
  to: "company" | string;
  title: (c: TemplateContext) => string;
  letter: (c: TemplateContext) => string;
};

const list = (items: string[], fallback: string) =>
  items.length ? items.map((n) => `- ${n}`).join("\n") : fallback;

export const TEMPLATES: RequestTemplate[] = [
  {
    key: "permits",
    label: "Permits for treatment works",
    layer: "permits",
    to: "environment_agency",
    title: (c) => `Discharge permits for sewage treatment works in the ${c.river} catchment`,
    letter: (c) =>
      `Under the Environmental Information Regulations 2004, please provide the current environmental permit (including all schedules and any variations) for each of the following ${c.company} sewage treatment works and their storm overflows in the ${c.river} catchment:

${list(c.assets, "- every sewage treatment works operated by " + c.company + " in the " + c.river + " catchment")}

For each permit, please make sure the figures for the permitted dry weather flow (DWF), the flow to full treatment (FFT), any storm tank or storage requirement, and the population equivalent are included.

Electronic copies are fine. If any permit is held only on paper, a scanned copy would be very helpful.`,
  },
  {
    key: "emergency_overflows",
    label: "Emergency overflow records",
    layer: "emergency_overflows",
    to: "company",
    title: (c) => `Emergency overflow locations and discharge records, ${c.river} catchment`,
    letter: (c) =>
      `Under the Environmental Information Regulations 2004, please provide the following for every emergency overflow (pumping station emergency overflow) operated by ${c.company} in the ${c.river} catchment:

1. Its name, permit reference, location (grid reference) and receiving water.
2. Whether it is fitted with an event duration monitor, and from what date.
3. For each calendar year from 2020 to date, the number of discharges and the total duration of discharges, in hours, as recorded by that monitor.

Please provide this as a spreadsheet (CSV or Excel) if possible.`,
  },
  {
    key: "incidents",
    label: "Pollution incidents (including category 3)",
    layer: "incidents",
    to: "environment_agency",
    title: (c) => `Pollution incidents in the ${c.river} catchment, 2020 to date`,
    letter: (c) =>
      `Under the Environmental Information Regulations 2004, please provide details of every substantiated pollution incident recorded in the National Incident Recording System for the ${c.river} catchment from 1 January 2020 to date, including category 3 (minor) incidents.

For each incident, please include: the date, the location (grid reference), the environmental impact category for water, the pollutant, the source or cause as recorded, the party identified as responsible where one was, and any enforcement action taken.

A spreadsheet (CSV or Excel) would be ideal. Personal data can of course be removed.`,
  },
  {
    key: "flow_spill",
    label: "Flow and spill data for one works",
    layer: "flow_spill",
    to: "company",
    title: (c) => `Flow and storm overflow data for ${c.assets[0] ?? "a sewage treatment works"} (${c.river})`,
    letter: (c) =>
      `Under the Environmental Information Regulations 2004, please provide the following for ${c.assets.length ? c.assets.join(", ") : "[name of works]"}, for each day from 1 January 2024 to date:

1. The flow passed to full treatment.
2. The flow discharged to the storm tanks, and from the storm tanks to the river.
3. The start and end time of every storm overflow discharge recorded by the event duration monitor.
4. Any alarms or faults recorded for the inlet works, storm overflow or monitor.

Please provide this as a spreadsheet (CSV or Excel) if possible.`,
  },
  {
    key: "capacity",
    label: "Capacity: flow to full treatment and population served",
    layer: "capacity",
    to: "company",
    title: (c) => `Treatment capacity and population served, ${c.river} catchment works`,
    letter: (c) =>
      `Under the Environmental Information Regulations 2004, please provide the following for each of these sewage treatment works in the ${c.river} catchment:

${list(c.assets, "- every sewage treatment works operated by " + c.company + " in the " + c.river + " catchment")}

1. The design flow to full treatment, and the flow to full treatment actually achieved in the last full year.
2. The population (or population equivalent) currently served.
3. Any assessment made since 2020 of whether the works has enough capacity for current and planned connections, and any planned increase in capacity with its expected date.`,
  },
];

export function templateByKey(key: string | null | undefined): RequestTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

// ---------- WhatDoTheyKnow ----------

/** A pre-filled WhatDoTheyKnow request (help/api: /new/<body>?title=&default_letter=&tags=). The
 *  tags let River Hub find the request again: riverhub, river:<slug> and request:<id>. */
export function wdtkNewRequestUrl(opts: { authoritySlug: string; title: string; letter: string; riverSlug: string; requestId: string }): string {
  const u = new URL(`https://www.whatdotheyknow.com/new/${encodeURIComponent(opts.authoritySlug)}`);
  u.searchParams.set("title", opts.title);
  u.searchParams.set("default_letter", opts.letter);
  u.searchParams.set("tags", `riverhub river:${opts.riverSlug} request:${opts.requestId}`);
  return u.toString();
}

// ---------- deadlines ----------

// England and Wales bank holidays, used when gov.uk can't be reached.
const FALLBACK_HOLIDAYS = [
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
];

/** England and Wales bank holidays from gov.uk (cached for a day), falling back to a built-in list. */
export async function bankHolidays(): Promise<Set<string>> {
  try {
    const res = await fetch("https://www.gov.uk/bank-holidays.json", { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { "england-and-wales"?: { events?: { date: string }[] } };
    const dates = body["england-and-wales"]?.events?.map((e) => e.date) ?? [];
    if (dates.length) return new Set(dates);
  } catch {
    /* fall through */
  }
  return new Set(FALLBACK_HOLIDAYS);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The date `days` working days after `from` (YYYY-MM-DD). The ICO counts the first working day after
 *  receipt as day one, so a request received on a Monday with 20 working days is due four weeks later
 *  (allowing for bank holidays). Weekends and England and Wales bank holidays are skipped. */
export function addWorkingDays(from: string, days: number, holidays: Set<string>): string {
  const d = new Date(`${from}T12:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(iso(d))) left--;
  }
  return iso(d);
}

/** EIR and FOI both allow 20 working days; EIR can be extended to 40 for complex or voluminous requests. */
export const RESPONSE_WORKING_DAYS = 20;
export const EIR_EXTENDED_WORKING_DAYS = 40;

/** Days until (positive) or past (negative) a due date, from today in UK time. */
export function daysUntil(due: string, today = new Date()): number {
  const t = new Date(today.toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T12:00:00Z");
  const d = new Date(`${due}T12:00:00Z`);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** The deadline that applies now: the extension if there is one, otherwise the standard due date. */
export function effectiveDue(r: { due_on: string | null; extended_to: string | null }): string | null {
  return r.extended_to ?? r.due_on;
}

/** "Due in 5 days", "Due today", "6 days late" — for open requests only. */
export function dueLabel(r: { status: InfoRequestStatus; due_on: string | null; extended_to: string | null }): string | null {
  const due = effectiveDue(r);
  if (!due || !OPEN_STATUSES.includes(r.status)) return null;
  const n = daysUntil(due);
  if (n > 1) return `Due in ${n} days`;
  if (n === 1) return "Due tomorrow";
  if (n === 0) return "Due today";
  return `${-n} day${n === -1 ? "" : "s"} late`;
}

export function fmtDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
