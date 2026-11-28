import { welshName } from "@/lib/nation";

/**
 * A river's name with its Welsh name where it has one (organisations.river_name_cy, migration 0135).
 * The Welsh part carries lang="cy" so a screen reader pronounces it as Welsh.
 *
 *   default      River Teifi  Afon Teifi        English first, Welsh beside it (lists across the site)
 *   welshFirst   Afon Teifi  River Teifi        a Welsh river's own pages (header, breadcrumb)
 *   stacked      the second name on its own line
 *
 * The second name is smaller and lighter (secondaryClassName). With no Welsh name, or one identical to
 * the English, it renders the English name alone.
 */
export function RiverName({
  name,
  cy,
  welshFirst = false,
  stacked = false,
  secondaryClassName = "font-normal text-brand-muted",
}: {
  name: string;
  cy?: string | null;
  welshFirst?: boolean;
  stacked?: boolean;
  secondaryClassName?: string;
}) {
  const w = welshName(name, cy);
  if (!w) return <>{name}</>;
  const welsh = <span lang="cy">{w}</span>;
  const first = welshFirst ? welsh : <>{name}</>;
  const second = welshFirst ? <>{name}</> : welsh;
  return (
    <>
      {first}
      {stacked ? (
        <span className={`block ${secondaryClassName}`}>{second}</span>
      ) : (
        <>
          {" "}
          <span className={secondaryClassName}>{second}</span>
        </>
      )}
    </>
  );
}
