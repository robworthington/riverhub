/**
 * Public RPCs that have a `p_org uuid` overload (migrations 0081–0084). The public data layer injects
 * the current river's org id as `p_org` for these when a call doesn't pass one, so pages under
 * /r/<slug> are org-scoped without every call site threading it. RPCs scoped by a unique id
 * (asset/system/event) derive their org from that id and are intentionally NOT listed here.
 */
export const P_ORG_RPCS: ReadonlySet<string> = new Set([
  "public_spills_problems",
  "public_eo_summary",
  "public_spill_year_range",
  "public_spills_board",
  "public_spills_repeat_offenders",
  "public_spills_works",
  "public_spill_pins",
  "public_spills_reduction",
  "public_spills_measures",
  "public_emergency_overflows",
  "public_area_assets",
  "public_area_sites",
  "public_area_stw",
  "public_districts",
  "public_parishes",
  "public_ea_wq_sites",
  "public_ea_wq_site_samples",
]);
