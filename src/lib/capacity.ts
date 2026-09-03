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
