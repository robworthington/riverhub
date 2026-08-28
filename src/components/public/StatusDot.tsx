// Live-status dot — colour = same status semantics used across the spills redesign.
// spilling (red, pulsing) · recent/stopped-<48h (amber) · ok/not-spilling (teal) · nodata (hollow).
export type SpillStatus = "spilling" | "recent" | "ok" | "nodata";

const FILL: Record<SpillStatus, string> = {
  spilling: "bg-rh-alarm",
  recent: "bg-rh-amber",
  ok: "bg-rh-teal",
  nodata: "bg-transparent ring-2 ring-inset ring-rh-nodata",
};

export function StatusDot({
  status,
  size = 9,
  live = false,
}: {
  status: SpillStatus;
  size?: number;
  live?: boolean;
}) {
  const pulse = status === "spilling" ? "animate-rh-pulse" : live && status === "ok" ? "animate-rh-pulse-slow" : "";
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${FILL[status]} ${pulse}`}
      style={{ width: size, height: size }}
    />
  );
}
