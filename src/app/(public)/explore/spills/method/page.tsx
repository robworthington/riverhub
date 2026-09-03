import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";
import { METHODOLOGY_URL, METHODOLOGY_VERSION } from "@/lib/dryspill";
import { OUTLET_CODE_META } from "@/lib/overflowNames";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `How we know — ${INSTANCE.portalName}`,
  description: "The rules that apply to a storm overflow, how River Hub classifies each spill and flags a problem, and the method documents behind every figure.",
};

const REPO = "https://github.com/robworthington/riverhub/blob/main";
const METHOD_DOCS = [
  { label: "Dry-spill classification", url: METHODOLOGY_URL },
  { label: "Population and capacity estimates", url: `${REPO}/POPULATION-CAPACITY-METHOD.md` },
  { label: "Grouping overflows to their works", url: `${REPO}/ASSET-GROUPING-METHOD.md` },
  { label: "Matching permits, and the gaps", url: `${REPO}/PERMITS-MATCH-AND-GAPS.md` },
  { label: "Severity and priority weighting", url: `${REPO}/PRIORITY-SITES-METHOD.md` },
  { label: "Where the spill data comes from", url: `${REPO}/EDM-DATA-SOURCING.md` },
  { label: "Defining the catchment", url: `${REPO}/CATCHMENT-METHOD.md` },
  { label: "Environment programme measures", url: `${REPO}/WINEP-DATA-RESEARCH.md` },
];

const THRESHOLDS = [
  { problem: "High spill frequency", fires: "400+ spills since 2020", weight: "4 (5 if 800+)" },
  { problem: "Spilling for very long periods", fires: "500+ hours in the last full year", weight: "4 (5 if 900+)" },
  { problem: "Dry spilling", fires: "5+ dry spills since 2020", weight: "3 (5 if 15+)" },
  { problem: "Spills before its works", fires: "4+ events since 2020", weight: "3 (5 if 12+)" },
  { problem: "Feed unreliable", fires: "no reading for 12+ hours", weight: "2" },
];

function Block({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
      <div className="font-plexmono text-[11px] font-semibold uppercase tracking-[.08em] text-rh-label">{eyebrow}</div>
      <h3 className="mt-1 text-[16px] font-bold text-rh-ink">{title}</h3>
      <div className="mt-2 max-w-[760px] text-[13.5px] leading-[1.55] text-rh-ink2">{children}</div>
    </div>
  );
}

function ClassifyBlock({ accent, title, children, link }: { accent: string; title: string; children: React.ReactNode; link?: string }) {
  return (
    <div className="rounded-[3px] border border-rh-line border-l-[3px] bg-rh-card px-[20px] py-4" style={{ borderLeftColor: accent }}>
      <h3 className="text-[15px] font-bold text-rh-ink">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-rh-ink2">{children}</p>
      {link && <a href={link} target="_blank" rel="noopener" className="mt-2 inline-block text-[12px] font-semibold text-rh-teal hover:underline">Method ↗</a>}
    </div>
  );
}

export default function MethodPage() {
  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">How we know</h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-rh-ink2">The rules that apply to a storm overflow, how each spill is classified, when we flag a problem, and the documents behind every figure.</p>
        <p className="mt-3 font-plexmono text-[11.5px] text-rh-ink3">
          Method {METHODOLOGY_VERSION} · every figure here is reproducible against this version · <a href={METHODOLOGY_URL} target="_blank" rel="noopener" className="text-rh-teal hover:underline">read the method ↗</a>
        </p>
      </div>

      {/* Part 1 — the rules that apply */}
      <section className="space-y-3">
        <h2 className="text-[18px] font-bold text-rh-ink">Part 1 · The rules that apply</h2>
        <Block eyebrow="Lawfulness" title="When a storm overflow may lawfully discharge">
          A storm overflow may discharge only in <strong>exceptional circumstances</strong>, and only where the company has used the best technology not entailing excessive cost to avoid it. The Office for Environmental Protection&apos;s December 2024 findings set out a two-stage test — was the discharge caused by exceptional circumstances, and was it nonetheless minimised — and Defra&apos;s 24 March 2025 guidance supersedes the 1997 guidance the regulators had relied on. All of this sits under the water company&apos;s section 94 duty to effectually drain its area.
        </Block>
        <Block eyebrow="The permit" title="What is in the permit, and what is not">
          A works&apos; environmental permit sets a permitted dry-weather flow (via Formula A) and a flow to full treatment — typically about three times DWF — below which everything must be treated, not spilled. It may set spill-frequency conditions: broadly <strong>3 significant spills</strong> per bathing season at a Good/Sufficient bathing water, <strong>2</strong> at an Excellent one, and around <strong>10 a year</strong> at shellfish waters (a spill over 50 m³ counts as significant). It sets a monitoring tier, and requires annual returns by <strong>28 February</strong>. The permit is the only stage that carries <strong>criminal liability</strong> — the WINEP obligation becomes enforceable once its result is written into the permit.
        </Block>
        <Block eyebrow="Investigation" title="When an overflow gets investigated">
          Under the Environment Agency&apos;s 2025 Storm Overflow Assessment Framework, an overflow is triggered for investigation at <strong>more than 30 spills</strong> with one year of data, <strong>more than 20</strong> with two years, or <strong>more than 10</strong> with three or more years. Crossing the threshold is what should put a site into the next environment programme.
        </Block>
      </section>

      {/* Part 2 — how we classify each spill */}
      <section className="space-y-3">
        <h2 className="text-[18px] font-bold text-rh-ink">Part 2 · How we classify each spill</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ClassifyBlock accent="#6b4a8f" title="Dry spill" link={METHODOLOGY_URL}>
            A spill counts as dry when the nearest EA rain gauge recorded <strong>≤ 0.25 mm on the spill day and the day before</strong>. A discharge with no rain to excuse it is presumptively non-compliant — an investigate signal, not proof of an offence.
          </ClassifyBlock>
          <ClassifyBlock accent="#9a4415" title="Spilled before its works" link={`${REPO}/ASSET-GROUPING-METHOD.md`}>
            When an upstream overflow spills on a day its own treatment works did not, the works still had capacity — so the problem is more likely local (a blockage on that branch) than catchment-wide. We flag these as pre-works spills.
          </ClassifyBlock>
          <ClassifyBlock accent="#7c94a6" title="Why very short spills are hidden">
            Monitors record in short intervals, and a single-interval blip often reflects sensor twitch rather than a real discharge. By default we exclude spills under <strong>15 minutes</strong> so counts reflect meaningful events.
          </ClassifyBlock>
          <ClassifyBlock accent="#7d8a8c" title="When a feed goes quiet">
            Live status comes from the water company&apos;s feed, which we poll hourly. A monitor that has gone quiet is <strong>not</strong> proof that nothing is spilling — it means nobody knows, so a quiet feed is shown as unknown, never as an all-clear.
          </ClassifyBlock>
        </div>
      </section>

      {/* Part 3 — when we flag a problem */}
      <section className="space-y-3">
        <h2 className="text-[18px] font-bold text-rh-ink">Part 3 · When we flag a problem</h2>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
            <table className="min-w-[440px] w-full text-[13px]">
              <thead>
                <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
                  <th className="px-[18px] py-2 text-left font-semibold">Problem</th>
                  <th className="px-3 py-2 text-left font-semibold">Fires at</th>
                  <th className="px-[18px] py-2 text-right font-semibold">Weight</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLDS.map((t) => (
                  <tr key={t.problem} className="border-b border-rh-rowDiv">
                    <td className="px-[18px] py-2.5 font-semibold text-rh-ink">{t.problem}</td>
                    <td className="px-3 py-2.5 text-rh-ink2">{t.fires}</td>
                    <td className="px-[18px] py-2.5 text-right font-plexmono text-rh-ink2">{t.weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="rounded-[3px] border border-rh-line bg-rh-card px-[18px] py-4">
              <h3 className="text-[14px] font-bold text-rh-ink">Confidence in a dry classification</h3>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-rh-ink2">Each dry spill is scored High / Medium by how solid the classification is — how close the rain gauge sits, how wide the antecedent-dry window is, and how reliably the monitor was reporting. The score is shown on every event&apos;s evidence dossier.</p>
            </div>
            <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[18px] py-4">
              <h3 className="text-[14px] font-bold text-rh-ink">What we cannot see</h3>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-rh-ink2">Misconnections, effluent quality from a normally-running works, flow transferred between works, maintenance history, and periods when a monitor was offline. Every count is a floor, not a total.</p>
            </div>
          </div>
        </div>
        <p className="max-w-[820px] text-[12px] text-rh-ink3">
          Thresholds are calibrated to the {INSTANCE.riverName}&apos;s 45 tracked overflows; an overflow&apos;s severity is the sum of its weights. Capacity verdicts use a 100% band (over the permitted flow) and a 95% band (at the limit).
        </p>
      </section>

      {/* why we have to link this ourselves */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-amber bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[16px] font-bold text-rh-ink">The data is public — the links are not</h2>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          Every dataset behind this site is already in the public domain: the Environment Agency&apos;s spill records, the WINEP measures, the permits, the rainfall. What is <strong>not</strong> published is the connective tissue — which measure addresses which overflow, which permit governs which outlet, which problem has an action against it and which is a gap. We assemble those links by hand, and where a link is missing we say so. Making these connections — so the public can see at a glance whether a failing overflow is being fixed — should be the job of the regulator, not of a volunteer group reconciling spreadsheets.
        </p>
      </div>

      {/* how overflows are named */}
      <section className="space-y-3">
        <h2 className="text-[18px] font-bold text-rh-ink">How overflows are named</h2>
        <p className="max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          We show a tidied version of the water company&apos;s own outlet names — the raw records read like{" "}
          <span className="font-plexmono text-[12px]">KILBURY STW_SSO_BUCKFASTLEIGH</span>. Each name is a{" "}
          <strong>site</strong> (a treatment works, <span className="font-plexmono text-[12px]">STW</span>, or a pumping
          station), an <strong>outlet-type code</strong>, and the <strong>town</strong> it serves. The code matters: a
          works can have more than one outlet, and two of them are different discharges, not the same one. We keep the
          code as a small tag next to each name — here is what each one means.
        </p>
        <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
          <table className="min-w-[520px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] uppercase tracking-[.06em] text-rh-label">
                <th className="px-[18px] py-2 text-left font-semibold">Tag</th>
                <th className="px-[18px] py-2 text-left font-semibold">What it is</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(OUTLET_CODE_META).filter((m, i, a) => a.findIndex((x) => x.short === m.short) === i).map((m) => (
                <tr key={m.short} className="border-b border-rh-rowDiv">
                  <td className="px-[18px] py-2 align-top"><span className="inline-flex rounded-[2px] border border-rh-lineSoft bg-rh-cardAlt px-1 py-px font-plexmono text-[10.5px] font-semibold text-rh-label">{m.short}</span></td>
                  <td className="px-[18px] py-2 text-rh-ink2">{m.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-[820px] text-[12px] text-rh-ink3">
          <span className="font-plexmono">STW</span> = sewage treatment works. Site names ending in a pumping-station code
          are shown as &ldquo;… pumping station&rdquo;. The raw names are preserved in the underlying data.
        </p>
      </section>

      {/* Sources + method documents */}
      <section className="space-y-3">
        <h2 className="text-[18px] font-bold text-rh-ink">Sources &amp; method documents</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {METHOD_DOCS.map((d) => (
            <a key={d.label} href={d.url} target="_blank" rel="noopener" className="flex items-center justify-between rounded-[3px] border border-rh-line bg-rh-card px-[18px] py-3 text-[13px] font-semibold text-rh-ink hover:bg-rh-rowHover">
              <span>{d.label}</span><span className="text-rh-teal">↗</span>
            </a>
          ))}
        </div>
        <p className="max-w-[820px] text-[12px] text-rh-ink3">
          The dry-spill method is pinned to commit <span className="font-plexmono">7b59571</span> to match the method version; the rest track the main branch. Capacity and permit-derived figures are indicative estimates — no figure here should be quoted in a consultation response or funding bid without opening the source. Spill data: Environment Agency EDM returns; live status: water-company near-real-time feeds. Not a substitute for official advice.
        </p>
      </section>
    </div>
  );
}
