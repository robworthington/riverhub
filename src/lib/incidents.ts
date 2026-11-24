// Pollution incidents: display helpers shared by the server lists and the client map (migration 0105).
// Kept apart from src/lib/nirs.ts, which downloads and parses the EA Access database on the server.

export const NIRS_ATTRIBUTION = "© Environment Agency copyright and/or database right. All rights reserved.";
export const NIRS_DATASET_URL =
  "https://www.data.gov.uk/dataset/c8625e18-c329-4032-b4c7-444b33af6780/environmental-pollution-incidents-category-1-and-21";

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

/** Title and letter for an EIR request to the EA for one incident's full report. The open dataset
 *  holds only the date, place, severity and pollutant; the cause, source, watercourse, sampling and
 *  any enforcement sit in the EA's incident record, which is environmental information. */
// The letter names only the EA reference, date and river: some overflows are named after a house
// address, and WhatDoTheyKnow publishes every letter.
export function incidentReportRequest(i: Pick<PublicIncident, "not_id" | "occurred_on">, riverName: string) {
  const title = `Pollution incident report, reference ${i.not_id} (${riverName})`;
  // WhatDoTheyKnow adds its own greeting and sign-off, as with the request-log templates.
  const letter = `Under the Environmental Information Regulations 2004, please provide the incident record and report for pollution incident notification ${i.not_id}, recorded on ${fmtIncidentDate(i.occurred_on)} in the ${riverName} catchment.

Please include:
1. The source and cause of the pollution recorded, and the watercourse affected.
2. Any water quality sampling or monitoring results taken in response.
3. The organisation identified as responsible, if any.
4. Any enforcement action taken or considered, and its outcome.

Please provide the information electronically.`;
  return { title, letter };
}
