// Horizontal stacked dry/wet(/unknown) mix bar. Dry = purple, wet = slate, unknown = grey,
// on a paper-well track. Radius 2, no labels — pair it with a mono total alongside.
export function MixBar({
  dry,
  wet,
  unknown = 0,
  height = 6,
  className = "",
}: {
  dry: number;
  wet: number;
  unknown?: number;
  height?: number;
  className?: string;
}) {
  const total = dry + wet + unknown;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  return (
    <div
      className={`w-full overflow-hidden rounded-[2px] bg-rh-lineSoft ${className}`}
      style={{ height }}
      role="img"
      aria-label={`${dry} dry, ${wet} wet${unknown ? `, ${unknown} unclassified` : ""}`}
    >
      <div className="flex h-full">
        <div className="h-full bg-rh-dry" style={{ width: pct(dry) }} />
        <div className="h-full bg-rh-wet" style={{ width: pct(wet) }} />
        {unknown > 0 && <div className="h-full bg-rh-nodata" style={{ width: pct(unknown) }} />}
      </div>
    </div>
  );
}
