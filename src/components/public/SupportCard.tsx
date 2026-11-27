import { SUPPORT_URL, SUPPORT_LABEL, SUPPORT_HANDLER_NOTE } from "@/lib/support";

// "Keep every river's record open" (spills page header, Nov 2026). Full on a river River Hub looks after;
// on a group's river the group strip asks for the group, so this shrinks to a quieter line.
export function SupportCard({ riverName, quiet = false }: { riverName: string; quiet?: boolean }) {
  if (quiet) {
    return (
      <a href={SUPPORT_URL} target="_blank" rel="noopener" className="text-[13px] font-semibold text-brand-navy hover:underline">
        Support River Hub, which keeps every river&rsquo;s record open ↗
      </a>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-[6px] bg-brand-navyDeep px-5 py-4 sm:w-[290px]">
      <span className="font-serif text-[16px] font-bold leading-[1.3] text-white">Keep every river&rsquo;s record open</span>
      <span className="text-[13px] leading-[1.55] text-brand-onNavy2">
        Volunteers run River Hub. Donations pay for the data, the information requests and the platform that keep the{" "}
        {riverName} and every other river in the open.
      </span>
      <a href={SUPPORT_URL} target="_blank" rel="noopener" className="self-start rounded-[4px] bg-white px-4 py-2 text-[13.5px] font-semibold text-brand-navyDeep hover:bg-brand-onNavy">
        {SUPPORT_LABEL}
      </a>
      <span className="text-[11px] leading-[1.45] text-brand-onNavy4">{SUPPORT_HANDLER_NOTE}</span>
    </div>
  );
}
