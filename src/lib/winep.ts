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

// Chip presentation per type (colours from the handoff / rh token set).
export const ACTION_TYPE_META: Record<WinepActionType, { label: string; className: string }> = {
  investigation: { label: "Investigation", className: "text-rh-amber bg-[#fdf7ec] border-[#e6cfa4]" },
  improvement: { label: "Improvement", className: "text-rh-teal bg-[#eef7f9] border-[#b9d9de]" },
  monitoring: { label: "Monitoring", className: "text-rh-label bg-rh-cardAlt border-rh-line" },
  "no-deterioration": { label: "No deterioration", className: "text-rh-wet bg-[#eef2f5] border-[#d3dee5]" },
  other: { label: "Other", className: "text-rh-label bg-rh-cardAlt border-rh-line" },
};
