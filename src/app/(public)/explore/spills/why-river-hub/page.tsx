import Link from "next/link";
import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Why River Hub exists — ${INSTANCE.portalName}`,
  description:
    "Bills in the South West rose about a third in April 2025 to fix sewage infrastructure, but there is no public, asset-level plan. River Hub is a volunteer effort to build the evidence a plan would need — and two things you can do about it.",
};

// Full-bleed helper (matches PageHeaderBand): break out of <main>'s container, cancel its top padding.
const bleed = "ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]";

const FIGURES = [
  {
    value: "+32%",
    accent: true,
    label: "South West Water bills, April 2025",
    caption:
      "The steepest rise across England and Wales since privatisation — an average English bill went from £480 to £603.",
  },
  {
    value: "£78bn",
    accent: false,
    label: "Paid out in dividends, 1991–2023",
    caption:
      "Against £190bn spent on infrastructure — while the industry, sold debt-free, accumulated over £64bn of net debt.",
  },
  {
    value: "£3.2bn",
    accent: false,
    label: "Pennon’s 2025–30 investment",
    caption:
      "Up from £1.9bn in 2020–25. Our bills fund it. No public dataset shows which assets it repairs, or why those ones.",
  },
];

const TELLS = [
  "Which overflows on the Dart spill most, for how long, and how that has changed year on year.",
  "Whether a treatment works has the capacity to serve the population it already carries — and what is left for growth.",
  "Which assets are failing chronically rather than exceptionally — the emergency overflows firing for hundreds of hours are the clearest case.",
  "Where the published record is silent, and what had to be obtained by information request to fill the gap.",
];

const SOURCES = [
  "Bills: Water UK, April 2025 tariffs (average England & Wales bill £480 → £603; South West Water and Bournemouth Water +32%). Ofwat PR24 final determinations, December 2024.",
  "Dividends and debt: Financial Times analysis of regulatory data, 1991–2023 (£78bn dividends, £190bn capital spend, £64bn+ net debt). Ofwat dividend and leakage datasets.",
  "Pennon: Pennon Group annual results, year to 31 March 2024 (statutory loss after tax £8.5m; total dividend 44.37p per share) and 2025–30 capital programme of £3.2bn, up from £1.9bn.",
  "Spills: Environment Agency EDM annual returns, 2024 (England total 3.61m hours; South West Water approx. 550,000 hours).",
];

export default function WhyRiverHubPage() {
  return (
    <>
      {/* hero */}
      <div className={`${bleed} -mt-8 bg-brand-navyDeep`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-[18px] px-5 py-[46px] sm:px-8">
          <span className="text-[12px] font-semibold uppercase tracking-[.16em] text-brand-onNavy4">Why River Hub exists</span>
          <h1 className="max-w-[26ch] font-serif text-[34px] font-bold leading-[1.1] tracking-[-0.015em] text-white sm:text-[46px]">
            You are paying again to fix this. Nobody has shown you the plan.
          </h1>
          <p className="max-w-[66ch] text-[18px] leading-[1.6] text-brand-onNavy3 [text-wrap:pretty]">
            Bills in the South West rose by about a third in April 2025, to pay for infrastructure that thirty years of
            billing was already meant to deliver. If we are paying twice, the least we should get is a public,
            evidence-based plan: which assets are failing, why, what fixing them costs, and in what order they get fixed.
            That plan does not exist in public. River Hub is a group of volunteers building the evidence for it.
          </p>
        </div>
      </div>

      {/* three figures */}
      <div className={`${bleed} border-b border-brand-line2 bg-brand-line2`}>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-px sm:grid-cols-3">
          {FIGURES.map((f) => (
            <div key={f.value} className="flex flex-col gap-[7px] bg-white px-7 py-[26px]">
              <span className={`font-serif text-[40px] font-bold leading-none ${f.accent ? "text-brand-accent" : "text-brand-navyDeep"}`}>{f.value}</span>
              <span className="text-[14.5px] font-semibold text-brand-text">{f.label}</span>
              <span className="text-[13px] leading-[1.5] text-brand-label">{f.caption}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-[38px] pt-10">
        {/* accountability */}
        <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.15fr_1fr] md:items-start">
          <div className="flex flex-col gap-3.5">
            <h2 className="font-serif text-[27px] font-bold leading-[1.2] text-brand-navyDeep">Higher bills should buy accountability, not just capital</h2>
            <p className="text-[16.5px] leading-[1.7] text-brand-body [text-wrap:pretty]">
              The case made for the increase was underinvestment. The record alongside it is harder to square: in the year
              to March 2024 Pennon reported a statutory loss after tax of £8.5m and still raised its dividend, to 44.37p a
              share. In 2024 South West Water recorded around 550,000 hours of sewage spills — the worst performance in the
              sector. Across England, storm overflows ran for a record 3.6 million hours.
            </p>
            <p className="text-[16.5px] leading-[1.7] text-brand-body [text-wrap:pretty]">
              We are not arguing about whether investment is needed. We are arguing that money raised from residents and
              businesses should come with a published, testable plan — and a way for the public to check progress against
              it. Right now, the data needed to write that plan is scattered across regulatory returns, annual reports and
              information requests, in formats designed to be difficult.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[6px] border border-brand-line2 bg-brand-band px-[26px] py-6">
            <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">What this site tells us</span>
            <ul className="flex flex-col gap-[9px] pl-5 text-[15px] leading-[1.65] text-brand-body" style={{ listStyleType: "disc" }}>
              {TELLS.map((t) => (<li key={t}>{t}</li>))}
            </ul>
          </div>
        </section>

        {/* did the regulator's job — with the caution box */}
        <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.15fr_1fr] md:items-start">
          <div className="flex flex-col gap-3.5">
            <h2 className="font-serif text-[27px] font-bold leading-[1.2] text-brand-navyDeep">So we did the regulator’s job, badly funded and in our spare time</h2>
            <p className="text-[16.5px] leading-[1.7] text-brand-body [text-wrap:pretty]">
              River Hub is built by volunteers at {INSTANCE.orgName}. To answer basic questions we had to invent our own
              methods — for example, estimating whether a treatment works can serve its local population, and how much
              headroom remains. Devising and publishing methods like that is the regulator’s and the water companies’ job,
              not ours.
            </p>
            <p className="text-[16.5px] leading-[1.7] text-brand-body [text-wrap:pretty]">
              Every method we use is written up on{" "}
              <Link href="/explore/spills/method" className="font-semibold text-brand-navy hover:underline">How we know</Link>, with
              its assumptions and its limits. Where a figure is an estimate, we say so on the figure. Where the data came
              from an information request rather than a live feed, we name the request.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 rounded-[6px] border border-l-[6px] border-brand-cautionBorder bg-brand-cautionBg px-[26px] py-6">
            <span className="text-[15px] font-bold leading-[1.3] text-brand-cautionText">What River Hub does not claim</span>
            <p className="text-[15px] leading-[1.65] text-brand-cautionText2 [text-wrap:pretty]">
              We do not claim these are the right answers. Our methods are the best a volunteer group could build from the
              public record, and we expect them to be improved on — or corrected.
            </p>
            <p className="text-[15px] leading-[1.65] text-brand-cautionText2 [text-wrap:pretty]">
              The point is that these questions <em>can</em> be answered transparently — and that whoever is spending our
              money should be answering them in public, so the public can have confidence that the fixes being designed are
              the right ones.
            </p>
          </div>
        </section>

        {/* two asks */}
        <section className="flex flex-col gap-4">
          <div className="flex max-w-[70ch] flex-col gap-2.5">
            <h2 className="font-serif text-[27px] font-bold leading-[1.2] text-brand-navyDeep">Two things we need from you</h2>
            <p className="text-[16.5px] leading-[1.65] text-brand-body [text-wrap:pretty]">
              The next round of environmental spending — the WINEP that decides which assets get fixed after 2030 — is being
              shaped now, from investigations already under way. River groups have a narrow window to get the worst assets
              onto that list, and it is closing.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* fund it */}
            <div className="flex flex-col gap-3.5 rounded-[6px] bg-brand-navyDeep px-[30px] py-7">
              <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-onNavy4">1 — Fund it</span>
              <span className="font-serif text-[23px] font-bold leading-[1.25] text-white">Help us scale River Hub to every river in the country</span>
              <p className="text-[15px] leading-[1.65] text-brand-onNavy2 [text-wrap:pretty]">
                One catchment proves the method. Every river group needs the same evidence for their own catchment, in time
                for the next WINEP cycle. Donations pay for the data work, the information requests and the platform — not
                salaries.
              </p>
              <a href={INSTANCE.donateUrl} target="_blank" rel="noopener" className="mt-1 self-start rounded-[4px] bg-white px-[26px] py-3.5 text-[15px] font-semibold text-brand-navyDeep transition-colors hover:bg-brand-onNavy">Donate</a>
            </div>
            {/* demand it */}
            <div className="flex flex-col gap-3.5 rounded-[6px] border border-brand-line2 bg-brand-band px-[30px] py-7">
              <span className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">2 — Demand it</span>
              <span className="font-serif text-[23px] font-bold leading-[1.25] text-brand-navyDeep">Write to your MP and ask the regulator to do this properly</span>
              <p className="text-[15px] leading-[1.65] text-brand-body [text-wrap:pretty]">
                Ask for three things: published methods for assessing whether each asset can serve its population; the
                results published as open data; and a plan that names the assets to be fixed, in order, with dates. We will
                give you the figures for your own catchment.
              </p>
              <Link href="/explore/spills/why-river-hub/write" className="mt-1 self-start rounded-[4px] bg-brand-navy px-[26px] py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-navyDeep">Write to your MP</Link>
            </div>
          </div>
        </section>

        {/* sources + reviewer note */}
        <div className="flex flex-col gap-[7px] border-t border-brand-line pt-5 text-[13px] leading-[1.6] text-brand-label">
          <span className="font-semibold text-brand-body">Sources</span>
          {SOURCES.map((s, i) => (<span key={i}>{s}</span>))}
          <span className="text-brand-accent">
            Check each figure against the primary source and date it before publishing — these were compiled in review,
            not by {INSTANCE.orgName}.
          </span>
        </div>
      </div>
    </>
  );
}
