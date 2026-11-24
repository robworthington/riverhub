// Live-status dot, matching the map pins (src/lib/liveMarker.ts).
//   spilling: bright red, largest, with an expanding halo (a fixed ring under reduced motion)
//   recent (stopped < 48h): lighter gold with a dark outline, so it differs from red in lightness too
//   ok / not spilling: teal, smallest · nodata: hollow grey ring
// `size` is the base diameter; spilling draws a little larger and ok / nodata a little smaller, so
// the urgent state wins at a glance even for anyone who can't tell red from amber.
export type SpillStatus = "spilling" | "recent" | "ok" | "nodata";

const FILL: Record<SpillStatus, string> = {
  spilling: "bg-rh-live ring-2 ring-white",
  recent: "bg-rh-recent ring-1 ring-inset ring-rh-recentRing",
  ok: "bg-rh-teal",
  nodata: "bg-transparent ring-2 ring-inset ring-rh-nodata",
};

const SCALE: Record<SpillStatus, number> = { spilling: 1.25, recent: 1, ok: 0.9, nodata: 0.9 };

export function StatusDot({
  status,
  size = 9,
  live = false,
}: {
  status: SpillStatus;
  size?: number;
  live?: boolean;
}) {
  const d = Math.round(size * SCALE[status]);
  if (status === "spilling") {
    return (
      <span aria-hidden className="relative inline-flex shrink-0" style={{ width: d, height: d }}>
        <span className="absolute inset-0 animate-rh-ping rounded-full bg-rh-live" />
        <span className={`relative inline-block h-full w-full rounded-full ${FILL.spilling}`} />
      </span>
    );
  }
  const pulse = live && status === "ok" ? "animate-rh-pulse-slow" : "";
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${FILL[status]} ${pulse}`}
      style={{ width: d, height: d }}
    />
  );
}
