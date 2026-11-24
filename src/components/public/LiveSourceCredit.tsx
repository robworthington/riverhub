import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentRiver } from "@/lib/river-context";

/**
 * Per-company attribution for the live storm-overflow status feed.
 *
 * The live "spilling now" data comes from each water company's own near-real-time storm-overflow
 * activity feed — South West Water's WaterFit feed and, for every other company, its node on the
 * National Storm Overflow Hub (Water UK). Those feeds are published under CC BY 4.0, which requires
 * attribution to the company, so we credit the current river's company by name. The annual spill
 * history shown alongside is Environment Agency EDM data under the Open Government Licence.
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
