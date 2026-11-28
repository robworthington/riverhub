import { getBranding } from "@/lib/river-context";
import { historyDate, regulatorFor } from "@/lib/nation";

/**
 * On a Welsh river, says when discharge-by-discharge spill history starts (WALES-ROLLOUT-PLAN.md §5).
 * England's history comes from the EA's start/stop files; Wales has none, so River Hub builds it from its
 * own hourly readings of the water company's live feed, which began on Regulator.spillHistoryFrom.
 * Earlier years have only the annual returns. Renders nothing on an English river.
 */
export async function SpillHistoryNote() {
  const b = await getBranding();
  const from = regulatorFor(b.nation).spillHistoryFrom;
  if (!from) return null;
  return (
    <p className="max-w-[820px] rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-cardAlt px-[20px] py-3 text-[13px] leading-[1.55] text-rh-ink2">
      <strong className="text-rh-ink">Individual spills are recorded from {historyDate(from)}.</strong> Wales has no
      published record of each discharge, so River Hub builds one by reading {b.companyName}&rsquo;s live feed every
      hour, starting on that date. Earlier years show the yearly totals from the annual returns only.
    </p>
  );
}
