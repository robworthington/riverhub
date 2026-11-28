import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentRiver } from "@/lib/river-context";
import { historyDate, regulatorFor } from "@/lib/nation";

/**
 * Per-company attribution for the live storm-overflow status feed.
 *
 * The live "spilling now" data comes from each water company's own near-real-time storm-overflow
 * activity feed — South West Water's WaterFit feed and, for every other company, its node on the
 * National Storm Overflow Hub (Water UK). Those feeds are published under CC BY 4.0, which requires
 * attribution to the company, so we credit the current river's company by name. The annual spill
 * history shown alongside is Environment Agency EDM data under the Open Government Licence.
 *
 * Wales (lib/nation): Dŵr Cymru's live feed is its own public map service, not the Hub, and its licence
 * is still being asked for, so no licence is claimed. Its annual returns go to NRW, and the
 * discharge-by-discharge history starts with River Hub's own hourly readings of the feed.
 */
export async function LiveSourceCredit({ companyName }: { companyName: string }) {
  // A catchment served by two companies (migration 0112) credits both, largest first; otherwise the
  // river's own company as before.
  let names = [companyName];
  const river = await getCurrentRiver();
  if (river) {
    const { data } = await createPublicClient().rpc("public_river_companies" as never, { p_org: river.orgId } as never);
    const list = (data as unknown as string[] | null) ?? [];
    if (list.length > 1) names = list;
  }
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const reg = regulatorFor(river?.nation);
  if (reg.spillHistoryFrom) {
    return (
      <p className="text-[11.5px] leading-[1.6] text-rh-ink3">
        Live storm-overflow status: {who}&rsquo;s public storm overflow map. Spill history: {reg.edmSource} for
        whole years; individual discharges from River Hub&rsquo;s hourly readings of the live feed, which began on{" "}
        {historyDate(reg.spillHistoryFrom)}.
      </p>
    );
  }
  return (
    <p className="text-[11.5px] leading-[1.6] text-rh-ink3">
      Live storm-overflow status: © {who} storm overflow activity data,{" "}
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener"
        className="underline hover:text-rh-ink2"
      >
        CC BY 4.0
      </a>
      . Spill history: Environment Agency EDM annual returns, Open Government Licence.
    </p>
  );
}
