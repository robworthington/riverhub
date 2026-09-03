// Emergency overflows (EOs / pumping-station emergency overflows). Historical EIR-sourced records,
// not a live feed — see supabase/migrations/0070_emergency_overflows.sql and the /emergency-overflows page.
import { overflowLabel } from "@/lib/overflowNames";

export type EoYear = {
  year: number;
  spills: number;
  hours: number;
  monitored: boolean; // false = no EDM that year (a 0 is "not monitored", not "no spills")
  partial: boolean; // the current, incomplete year
};

export type EoRow = {
  id: string;
  overflow_name: string;
  permit_ref: string;
  stw_catchment: string | null;
  receiving_water: string | null;
  system_id: string | null;
  system_name: string | null;
  lat: number | null;
  lng: number | null;
  edm_commissioned: string | null;
  total_spills: number;
  total_hours: number;
  latest_year: number | null;
  latest_spills: number | null;
  latest_hours: number | null;
  worst_year: number | null;
  worst_hours: number | null;
  years: EoYear[];
};

export type EoSummary = {
  eo_count: number;
  active_count: number;
  lfy: number | null;
  hours_lfy: number | null;
  worst_name: string | null;
  worst_hours: number | null;
};

export type EoForSystem = {
  id: string;
  overflow_name: string;
  permit_ref: string;
  latest_year: number | null;
  latest_hours: number | null;
  total_hours: number | null;
  worst_hours: number | null;
};

// Round hours for display: whole numbers, but keep one decimal below 10 so short spills don't vanish.
export function fmtHours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h === 0) return "0";
  if (h < 10) return h.toFixed(h < 1 ? 2 : 1);
  return Math.round(h).toLocaleString();
}

// Clean up the EIR name for display. Delegates to the shared outlet-name parser so EOs read the same
// way as storm overflows ("Blackrock pumping station, Buckfast").
export function eoDisplayName(raw: string): string {
  return overflowLabel(raw);
}

// The years an EO was monitored, as a compact "since YYYY" phrase from the commissioning field.
export function commissionedLabel(c: string | null): string {
  if (!c) return "unknown";
  if (/pre/i.test(c)) return "before 2016";
  return c;
}
