// Classification / status chips. Fixed colour semantics from the spills redesign tokens.
export type ChipVariant = "dry" | "wet" | "prestw" | "spilling" | "recent" | "quiet" | "teal";

// bg / text / border per variant (one-off tints; kept as arbitrary values so they don't bloat the token set)
const STYLES: Record<ChipVariant, string> = {
  dry: "bg-[#f0eaf7] text-[#55337c] border-[#d8c8ea]",
  wet: "bg-[#eef2f5] text-[#3f5a6b] border-[#d3dee5]",
  prestw: "bg-[#fdeee7] text-[#9a4415] border-[#f0cdb8]",
  // solid red so "Spilling" never reads like the pale "Stopped … ago" chip beside it (white on #d7261e = 4.9:1)
  spilling: "bg-rh-live text-white border-rh-live",
  recent: "bg-[#fbf1de] text-[#8a5a0c] border-[#e8d3ab]",
  quiet: "bg-[#eaf1ef] text-[#3d5b58] border-[#d3dedb]",
  teal: "bg-[#e6f0ee] text-rh-teal border-[#cfe0dc]",
};

export function Chip({
  variant,
  children,
  mono = false,
  className = "",
  title,
}: {
  variant: ChipVariant;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold ${
        mono ? "font-plexmono" : "font-archivo"
      } ${title ? "cursor-help" : ""} ${STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
