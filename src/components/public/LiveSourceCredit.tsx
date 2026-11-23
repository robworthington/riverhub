/**
 * Per-company attribution for the live storm-overflow status feed.
 *
 * The live "spilling now" data comes from each water company's own near-real-time storm-overflow
 * activity feed — South West Water's WaterFit feed and, for every other company, its node on the
 * National Storm Overflow Hub (Water UK). Those feeds are published under CC BY 4.0, which requires
 * attribution to the company, so we credit the current river's company by name. The annual spill
 * history shown alongside is Environment Agency EDM data under the Open Government Licence.
 */
export function LiveSourceCredit({ companyName }: { companyName: string }) {
  return (
    <p className="text-[11.5px] leading-[1.6] text-rh-ink3">
      Live storm-overflow status: © {companyName} storm overflow activity data,{" "}
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
