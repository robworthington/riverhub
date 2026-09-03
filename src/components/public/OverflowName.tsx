import { parseOverflow, OUTLET_CODE_META } from "@/lib/overflowNames";

// A hoverable chip for the outlet-type code (CSO / SO / SSO / EO …). The title gives the plain-English
// meaning. Kept small and quiet so it reads as metadata next to the name.
export function OutletChip({ code, className = "" }: { code: string | null; className?: string }) {
  if (!code) return null;
  const meta = OUTLET_CODE_META[code.toUpperCase()];
  if (!meta) return null;
  return (
    <span
      title={meta.label}
      className={`ml-1.5 inline-flex cursor-help items-center rounded-[2px] border border-rh-lineSoft bg-rh-cardAlt px-1 py-px align-middle font-plexmono text-[9.5px] font-semibold tracking-[.03em] text-rh-label ${className}`}
    >
      {meta.short}
    </span>
  );
}

// Cleaned "Site, Town" label plus the outlet-type chip. Pure/presentational — safe in server or client
// trees. Set chip={false} where the outlet type is already implied by context (e.g. the EO page).
export function OverflowName({
  raw,
  type,
  chip = true,
  className = "",
}: {
  raw: string | null | undefined;
  type?: string | null;
  chip?: boolean;
  className?: string;
}) {
  const p = parseOverflow(raw, type);
  return (
    <span className={className}>
      {p.display}
      {chip && <OutletChip code={p.code} />}
    </span>
  );
}
