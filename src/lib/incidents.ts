// Pollution incidents: display helpers shared by the server lists and the client map (migration 0105).
// Kept apart from src/lib/nirs.ts, which downloads and parses the EA Access database on the server.

import { regulatorFor, type Regulator } from "@/lib/nation";

export const NIRS_ATTRIBUTION = "© Environment Agency copyright and/or database right. All rights reserved.";
export const NIRS_DATASET_URL =
  "https://www.data.gov.uk/dataset/c8625e18-c329-4032-b4c7-444b33af6780/environmental-pollution-incidents-category-1-and-21";
// Natural Resources Wales's incidents (migration 0136, scripts/import_nrw_incidents.py)
export const NRW_INCIDENTS_ATTRIBUTION = "Contains Natural Resources Wales information © Natural Resources Wales and Database Right.";
export const NRW_INCIDENTS_DATASET_URL = "https://datamap.gov.wales/documents/2642";

/** The incidents dataset a river's pages credit: the EA's in England, NRW's in Wales. */
export function incidentsDataset(nation: string | null | undefined) {
  return nation === "wales"
    ? { url: NRW_INCIDENTS_DATASET_URL, attribution: NRW_INCIDENTS_ATTRIBUTION }
    : { url: NIRS_DATASET_URL, attribution: NIRS_ATTRIBUTION };
}

/** Who published one incident record (its source, migration 0136): NRW for 'nrw-epi', else the EA. */
export function incidentPublisher(i: Pick<PublicIncident, "source">): Regulator {
  return regulatorFor(i.source === "nrw-epi" ? "wales" : "england");
}

/** The publisher's own reference for an incident (NRW rows are stored under an offset id). */
export const incidentRef = (i: Pick<PublicIncident, "not_id" | "ref">): string => i.ref ?? String(i.not_id);

/** Display names for the sewage pollutants the public pages list. */
export const SEWAGE_POLLUTANT_LABEL: Record<string, string> = {
  "Crude Sewage": "Crude sewage",
  "Storm Sewage": "Storm sewage",
  "Final Effluent": "Treated effluent",
  "Grey Water": "Grey water",
  "Other Sewage Material": "Other sewage",
  Sludge: "Sewage sludge",
  "Process Effluent": "Process effluent",
};

/** One public incident, as public_pollution_incidents() returns it. */
export type PublicIncident = {
  not_id: number; occurred_on: string; occurred_time?: string | null; category: number; land_category?: number | null;
  pollutants: string[]; asset_id: string | null; asset_name: string | null; asset_type: string | null;
  distance_m: number | null; lat: number; lng: number;
  /** 'ea-nirs' or 'nrw-epi', and the publisher's reference (migration 0136; absent before it) */
  source?: string | null; ref?: string | null;
};

/** EA environmental impact levels (EIL): 1 major, 2 significant, 3 minor, 4 none. */
export const IMPACT_LABEL: Record<number, string> = { 1: "Major", 2: "Significant", 3: "Minor", 4: "No impact" };

/** What each sewage pollutant means, in plain English, for the map popup. */
export const SEWAGE_POLLUTANT_EXPLAIN: Record<string, string> = {
  "Crude Sewage": "untreated sewage",
  "Storm Sewage": "sewage diluted with rainwater, from a storm overflow",
  "Final Effluent": "water leaving a treatment works that hadn't been treated well enough",
  "Grey Water": "waste water from sinks, baths and washing machines",
  "Other Sewage Material": "other sewage material",
  Sludge: "solids removed during sewage treatment",
  "Process Effluent": "partly treated sewage from inside a works",
};

export function pollutantText(p: string[]): string {
  const labels = p.map((x) => SEWAGE_POLLUTANT_LABEL[x] ?? x);
  return labels.length ? labels.join(", ") : "Sewage";
}

export function fmtIncidentDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Significant impact on water, and on land" — the EA's severity in words. */
export function impactText(i: Pick<PublicIncident, "category" | "land_category">): string {
  const water = `${IMPACT_LABEL[i.category] ?? "Serious"} impact on water`;
  const land = i.land_category && i.land_category <= 2 ? `, ${IMPACT_LABEL[i.land_category].toLowerCase()} on land` : "";
  return water + land;
}

/** Title and letter for an EIR request to the publisher (EA or NRW) for one incident's full report.
 *  The open dataset holds only the date, place, severity and pollutant; the cause, source,
 *  watercourse, sampling and any enforcement sit in the incident record, which is environmental
 *  information. */
// The letter names only the reference, date and river: some overflows are named after a house
// address, and WhatDoTheyKnow publishes every letter.
export function incidentReportRequest(i: Pick<PublicIncident, "not_id" | "occurred_on" | "ref">, riverName: string) {
  const ref = incidentRef(i);
  const title = `Pollution incident report, reference ${ref} (${riverName})`;
  // WhatDoTheyKnow adds its own greeting and sign-off, as with the request-log templates.
  const letter = `Under the Environmental Information Regulations 2004, please provide the incident record and report for pollution incident ${ref}, recorded on ${fmtIncidentDate(i.occurred_on)} in the ${riverName} catchment.

Please include:
1. The source and cause of the pollution recorded, and the watercourse affected.
2. Any water quality sampling or monitoring results taken in response.
3. The organisation identified as responsible, if any.
4. Any enforcement action taken or considered, and its outcome.

Please provide the information electronically.`;
  return { title, letter };
}
