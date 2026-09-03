import { INSTANCE } from "@/lib/instance";

// End-of-page donate ask (design_handoff_riverhub_header §6). Navy panel; heading/body are per-page
// so the numbers can be specific. Reused across the spills pages and the intro page.
export function DonateAsk({ title, body }: { title: React.ReactNode; body: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-9 rounded-[6px] bg-brand-navyDeep px-[34px] py-[30px]">
      <div className="max-w-[62ch] space-y-2">
        <h2 className="font-serif text-[22px] font-bold leading-[1.25] text-white">{title}</h2>
        <p className="text-[14.5px] leading-[1.6] text-brand-onNavy2">{body}</p>
      </div>
      <a
        href={INSTANCE.donateUrl}
        target="_blank"
        rel="noopener"
        className="shrink-0 whitespace-nowrap rounded-[4px] bg-white px-[26px] py-[14px] text-[15px] font-semibold text-brand-navyDeep transition-colors hover:bg-brand-onNavy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Donate
      </a>
    </div>
  );
}
