import type { LiveStatus } from "@/lib/spillStatus";

// One look for an overflow's live status on every map (Yealm feedback, Nov 2026). Spilling now is
// the biggest, brightest pin and carries an expanding halo; spilled in the last 48 hours is smaller
// and a lighter gold with a dark outline, so the two differ in size and lightness, not hue alone.
// Keep in step with the rh.live / rh.recent / rh.recentRing tokens in tailwind.config.ts.
export const LIVE_MARKER: Record<LiveStatus, { fill: string; ring: string; weight: number; radius: number }> = {
  spilling: { fill: "#d7261e", ring: "#ffffff", weight: 2.5, radius: 9 },
  recent: { fill: "#f2a93b", ring: "#6b4400", weight: 1.5, radius: 6 },
  ok: { fill: "#0d6b62", ring: "#ffffff", weight: 2, radius: 5.5 },
  nodata: { fill: "#ffffff", ring: "#7d8a8c", weight: 2, radius: 5.5 },
};

export const LIVE_LABEL: Record<LiveStatus, string> = {
  spilling: "Spilling now",
  recent: "Spilled in last 48h",
  ok: "Not spilling",
  nodata: "No data from feed",
};
