// Derive a WINEP action's type from its driver code (WINEP-DATA-RESEARCH.md). The regulatory
// requirement is encoded in the code's action-type segment — e.g. U_IMP1 (improvement), U_MON3
// (monitoring), SW_INV (investigation), BW_ND / BW_NDINV (no-deterioration / investigation). Pure
// helper so the register, the asset page and any future charts agree. Not stored — always derived.

export type WinepActionType = "investigation" | "monitoring" | "improvement" | "no-deterioration" | "other";

export function actionTypeFromDriver(code: string | null | undefined): WinepActionType {
  if (!code) return "other";
  const c = code.toUpperCase();
  if (c.includes("INV")) return "investigation"; // INV, and NDINV (an investigation)
  if (c.includes("IMP")) return "improvement";
  if (c.includes("MON")) return "monitoring";
  if (c.includes("ND")) return "no-deterioration"; // ND, NDLS
  return "other";
}

// What a measure requires: use its own description only when it is real prose — in this WINEP data
// action_description is often just the type code ("MON"/"INV"/"IMP"), so fall back to the type-derived
// phrase unless the description contains a space (i.e. is a sentence, not a code).
export function measureRequirement(actionDescription: string | null | undefined, type: WinepActionType): string {
  const d = (actionDescription || "").trim();
  return d.includes(" ") ? d : ACTION_TYPE_META[type].requires;
}

// Chip presentation + a plain-English requirement per type. This WINEP dataset carries no per-measure
// description, so the requirement is derived from the type (the driver code is the only real detail).
export const ACTION_TYPE_META: Record<WinepActionType, { label: string; className: string; requires: string }> = {
  investigation: { label: "Investigation", className: "text-rh-amber bg-rh-chipAmberBg border-rh-chipAmberBorder", requires: "Investigate the cause of the spills" },
  improvement: { label: "Improvement", className: "text-rh-teal bg-rh-chipTealBg border-rh-chipTealBorder", requires: "Deliver a physical improvement" },
  monitoring: { label: "Monitoring", className: "text-rh-label bg-rh-cardAlt border-rh-line", requires: "Install and run event-duration monitoring" },
  "no-deterioration": { label: "No deterioration", className: "text-rh-wet bg-[#eef2f5] border-[#d3dee5]", requires: "Prevent any deterioration" },
  other: { label: "Other", className: "text-rh-label bg-rh-cardAlt border-rh-line", requires: "See the driver" },
};
