// Phase 3 (design_handoff_riverhub_intro "Data"): generate the "evidence by postcode" lookup for the
// Write-to-your-MP tool from the live emergency-overflow record, so it can never contradict the
// emergency-overflows page. Keyed by outward postcode code; falls back to the catchment record.
import { type EoRow, type EoSummary, fmtHours, eoDisplayName } from "@/lib/emergencyOverflows";

export type Fact = { value: string; text: string };
export type Area = { name: string; facts: Fact[] };
export type Evidence = { areas: Record<string, Area>; catchment: Area };

// Curated outward-code → area, defined by the works-catchment towns (the last segment of an EO's
// stw_catchment) that belong to it. `worksLabel` overrides the generic "in the … area" phrasing.
const AREA_DEFS: { code: string; name: string; towns: string[]; worksLabel?: string }[] = [
  { code: "TQ6", name: "Dartmouth & Kingswear", towns: ["dartmouth", "kingswear", "dittisham"] },
  { code: "TQ11", name: "Buckfastleigh & Buckfast", towns: ["buckfastleigh", "buckfast", "dean prior"], worksLabel: "feeding Buckfastleigh treatment works" },
  { code: "TQ9", name: "Totnes, Staverton & Tuckenhay", towns: ["totnes", "staverton", "tuckenhay", "ashprington"] },
];

// The works-catchment town for an EO — the last "_"-segment of stw_catchment (e.g.
// "KILBURY_STW_BUCKFASTLEIGH" → "buckfastleigh"), so overflows are grouped by the works they feed.
function catchmentTown(eo: EoRow): string {
  const parts = (eo.stw_catchment ?? "").split("_");
  return (parts[parts.length - 1] || "").trim().toLowerCase();
}

function days(hours: number | null | undefined): string {
  const d = (hours ?? 0) / 24;
  if (d < 1) return "under a day";
  return `about ${d >= 10 ? Math.round(d) : d.toFixed(1)} days`;
}

const NO_FEED: Fact = {
  value: "no feed",
  text: "none of these appear in the live storm-overflow map; the figures came from an information request.",
};

function areaFacts(eos: EoRow[], def: { name: string; worksLabel?: string }, riverName: string): Fact[] {
  const facts: Fact[] = [];
  const worst = [...eos].sort((a, b) => (b.worst_hours ?? 0) - (a.worst_hours ?? 0))[0];
  if (worst && (worst.worst_hours ?? 0) > 0) {
    facts.push({
      value: `${fmtHours(worst.worst_hours)} hrs`,
      text: `${eoDisplayName(worst.overflow_name)} discharged for ${fmtHours(worst.worst_hours)} hours in ${worst.worst_year} — ${days(worst.worst_hours)} of raw sewage from one emergency overflow.`,
    });
  }
  facts.push({
    value: String(eos.length),
    text: def.worksLabel
      ? `emergency overflows ${def.worksLabel}.`
      : `emergency overflows in the ${def.name} area, all discharging to the ${riverName}.`,
  });
  facts.push(NO_FEED);
  return facts;
}

export function buildEvidence(eoRows: EoRow[], summary: EoSummary | null, riverName: string): Evidence {
  const areas: Record<string, Area> = {};
  for (const def of AREA_DEFS) {
    const eos = eoRows.filter((e) => def.towns.includes(catchmentTown(e)));
    if (eos.length === 0) continue;
    areas[def.code] = { name: def.name, facts: areaFacts(eos, def, riverName) };
  }

  const totalHours = eoRows.reduce((s, e) => s + (e.total_hours ?? 0), 0);
  const catchment: Area = {
    name: `${riverName} catchment`,
    facts: [
      { value: `${fmtHours(totalHours)} hrs`, text: `of recorded discharge from emergency overflows across the catchment, 2020–2025.` },
      {
        value: String(summary?.eo_count ?? eoRows.length),
        text: `emergency overflows on record${summary?.active_count != null && summary?.lfy != null ? ` — ${summary.active_count} of them discharged in ${summary.lfy}.` : "."}`,
      },
      { value: "0", text: "of them appear in any live public feed. Every figure on this site came from an information request." },
    ],
  };

  return { areas, catchment };
}
