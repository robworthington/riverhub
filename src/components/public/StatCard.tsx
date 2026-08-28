// Stat card with a meaning-carrying left accent bar, a big mono value in the accent colour,
// a caption, and a quiet subline. Used across the board and section headers.
export type StatAccent = "alarm" | "amber" | "dry" | "prestw" | "nodata" | "teal";

const ACCENT: Record<StatAccent, { bar: string; value: string }> = {
  alarm: { bar: "border-l-rh-alarm", value: "text-rh-alarm" },
  amber: { bar: "border-l-rh-amber", value: "text-rh-amber" },
  dry: { bar: "border-l-rh-dry", value: "text-rh-dry" },
  prestw: { bar: "border-l-rh-prestw", value: "text-rh-prestw" },
  nodata: { bar: "border-l-rh-nodata", value: "text-[#465557]" },
  teal: { bar: "border-l-rh-teal", value: "text-rh-teal" },
};

export function StatCard({
  accent,
  value,
  caption,
  subline,
}: {
  accent: StatAccent;
  value: React.ReactNode;
  caption: string;
  subline?: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className={`flex-1 rounded-[3px] border border-rh-line border-l-4 ${a.bar} bg-rh-card px-[18px] py-4`}>
      <div className={`font-plexmono text-[34px] font-bold leading-none ${a.value}`}>{value}</div>
      <div className="mt-2 text-[13px] font-semibold text-rh-ink">{caption}</div>
      {subline != null && <div className="mt-1 text-[12px] text-rh-ink3">{subline}</div>}
    </div>
  );
}
