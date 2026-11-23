// Spare treatment-works capacity, expressed as how many more people the works could serve before it
// reaches its permitted dry-weather flow. Estimated from the permitted flow, the estimated demand and
// the estimated population on the works — all indicative, like the rest of the capacity view.
//   per-head demand ≈ demand / population ; headroom flow = permit − demand
//   extra people    = headroom / per-head  = population × (permit − demand) / demand
// Returns null when any input is missing; a value ≤ 0 means no spare capacity (at or over the limit).
export function sparePeople(
  permitDwf: number | string | null,
  demand: number | string | null,
  population: number | null,
): number | null {
  const permit = permitDwf == null ? null : Number(permitDwf);
  const dem = demand == null ? null : Number(demand);
  if (permit == null || dem == null || dem <= 0 || population == null || population <= 0) return null;
  return population * (permit - dem) / dem;
}

// Rounded, approximate display: nearest 100 above 1,000, nearest 10 below.
export function fmtSpare(extra: number | null): string {
  if (extra == null) return "Not known";
  if (extra <= 0) return "None";
  const rounded = extra >= 1000 ? Math.round(extra / 100) * 100 : Math.round(extra / 10) * 10;
  return `~${rounded.toLocaleString()}`;
}

// ---------- where a works' permitted flow came from (migration 0103) ----------

/** A works whose permitted DWF came from WINEP (no loaded permit), or whose WINEP figure was refused
 *  because it doesn't fit River Hub's demand estimate (public_capacity_sources). */
export type CapacitySource = {
  system_id: string;
  source: "winep" | "mismatch";
  dwf_m3d: number | string;
  proposed_dwf_m3d: number | string | null;
  proposed_note: string | null;
  completion_date: string | null;
  cycle: string | null;
  action_name: string | null;
  demand_central: number | string | null;
  population: number | null;
};

const n = (v: number | string | null | undefined) => (v == null ? null : Number(v));
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null);

/** "The permitted flow is from WINEP (PR24), the regulator's list of required improvements; the permit itself isn't loaded." */
export function winepSourceSentence(s: CapacitySource): string {
  return `The permitted flow here is from WINEP${s.cycle ? ` (${s.cycle})` : ""}, the regulator's list of required improvements, because River Hub hasn't loaded this works' permit.`;
}

/** What WINEP plans for the works' permit, if it says: "WINEP proposes raising it to 2,600 m³/day by May 2030." */
export function winepPlanSentence(s: CapacitySource): string | null {
  const cur = n(s.dwf_m3d);
  const prop = n(s.proposed_dwf_m3d);
  const by = fmtDay(s.completion_date);
  if (prop != null && cur != null && prop !== cur) {
    return `WINEP proposes ${prop > cur ? "raising" : "lowering"} it to ${prop.toLocaleString("en-GB")} m³/day${by ? ` by ${by}` : ""}.`;
  }
  if (s.proposed_note && /evaluation/i.test(s.proposed_note)) {
    return `WINEP says the permit ${by ? `needs a detailed evaluation, due by ${by}` : "needs a detailed evaluation"}.`;
  }
  return null;
}

/** Why a matched WINEP figure wasn't used: it doesn't fit the population estimate. */
export function winepMismatchSentence(s: CapacitySource): string {
  const dwf = n(s.dwf_m3d);
  const pop = s.population;
  return `WINEP gives this works a permitted flow of ${dwf != null ? dwf.toLocaleString("en-GB") : "?"} m³/day, which doesn't fit River Hub's estimate of ${pop != null && pop > 0 ? `about ${pop.toLocaleString("en-GB")} people` : "the people"} on its system, so one of the two figures is wrong for this works. It isn't assessed until a permit is loaded.`;
}
