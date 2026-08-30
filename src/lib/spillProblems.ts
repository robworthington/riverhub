// Shared definition of the five spill problems — imported by both the server page (for the matrix)
// and the client case list. Kept out of any "use client" module so server components get the real
// array, not a client-reference proxy.

export type ProblemRow = {
  asset_id: string; asset_name: string; asset_code: string | null; system_name: string | null;
  total_spills: number; hours_lfy: number; dry: number; pre_stw: number; feed_hours: number | null;
  w_freq: number; w_long: number; w_dry: number; w_prestw: number; w_feed: number;
  weight: number; has_action: boolean;
};

// One place defining the five problems: label, colour, which weight field, and the evidence line.
export const PROBLEMS = [
  { key: "freq", label: "High spill frequency", color: "#b8342a", w: (r: ProblemRow) => r.w_freq, ev: (r: ProblemRow) => `${r.total_spills.toLocaleString()} spills since 2020` },
  { key: "long", label: "Very long spills", color: "#c07a12", w: (r: ProblemRow) => r.w_long, ev: (r: ProblemRow) => `${r.hours_lfy.toLocaleString()} hours in the last full year` },
  { key: "dry", label: "Dry spilling", color: "#6b4a8f", w: (r: ProblemRow) => r.w_dry, ev: (r: ProblemRow) => `${r.dry} dry spills since 2020` },
  { key: "prestw", label: "Spills before its works", color: "#9a4415", w: (r: ProblemRow) => r.w_prestw, ev: (r: ProblemRow) => `${r.pre_stw} times since 2020` },
  { key: "feed", label: "Feed unreliable", color: "#7d8a8c", w: (r: ProblemRow) => r.w_feed, ev: (r: ProblemRow) => (r.feed_hours == null ? "monitor not reporting" : `no reading for ${Math.round(r.feed_hours)}h`) },
] as const;
