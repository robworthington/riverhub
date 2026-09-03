import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { prettyWorksName } from "@/lib/overflowNames";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { sparePeople, fmtSpare } from "@/lib/capacity";

// Rendered per-request against the live DB — see gaps/page.tsx (ISR stale-empty pattern).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Treatment works capacity — ${INSTANCE.portalName}`,
  description: `Is each treatment works big enough for the population it serves? We estimate each works' capacity from its Environment Agency permit against the population on the sewage system across the ${INSTANCE.riverName} catchment.`,
};

type Verdict = "over" | "limit" | "within" | "not_assessed";
type Diagnosis = "capacity" | "upstream" | "both" | "not_assessed" | "none";
type WorksRow = {
  system_id: string; system_name: string; works_asset_id: string; works_name: string;
  population: number | null; permit_dwf: number | string | null; demand_central: number | string | null;
  load_pct: number | null; verdict: Verdict; has_monitor: boolean;
  works_hours: number; upstream_count: number; pre_stw_count: number; diagnosis: Diagnosis;
};

const num = (v: number | string | null) => (v == null ? null : typeof v === "number" ? v : Number(v));

export default async function WorksCapacityPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_works" as never, {} as never);
  const rows = (data ?? []) as unknown as WorksRow[];

  const total = rows.length;
  const over = rows.filter((r) => r.verdict === "over");
  const atLimit = rows.filter((r) => r.verdict === "limit");
  const unassessed = rows.filter((r) => r.verdict === "not_assessed");
  const affectedPop = [...over, ...atLimit].reduce((s, r) => s + (r.population ?? 0), 0);
  const headroomButSpills = rows.filter((r) => r.diagnosis === "upstream").length;
  const noPermit = rows.filter((r) => r.permit_dwf == null).length;

  const statCards = [
    { accent: "#b8342a", value: over.length, label: "Over their permitted flow", sub: "estimated load above the permit" },
    { accent: "#9a4415", value: headroomButSpills, label: "Have headroom but spill anyway", sub: "points to another problem" },
    { accent: "#7d8a8c", value: unassessed.length, label: "Cannot be assessed", sub: "no permit received yet" },
    { accent: "#b8342a", value: affectedPop.toLocaleString(), label: "People on an over-loaded works", sub: "served by works over or at the limit" },
  ];

  return (
    <>
      <PageHeaderBand
        title="Treatment works capacity"
        intro={<>Every overflow goes to a sewage treatment works that serves a fixed area. There is no public data available to understand if the works has sufficient capacity to treat the sewage for the local population. We estimate this capacity based on the required capacity in the EA permit compared to the local population estimated to be on the sewage system. As we receive data on the actual processing capacity from {INSTANCE.companyName ?? "the water company"} we will add that too.</>}
      />
      <PageBody className="space-y-6">

      {/* headline banner */}
      <div className="rounded-[3px] bg-rh-ink px-[26px] py-6 text-[#e8efee]">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-[#8fa5a3]">Capacity across the {INSTANCE.riverName}</p>
        <p className="mt-2 max-w-[760px] text-[22px] font-bold leading-[1.3] tracking-[-0.01em]">
          {over.length > 0 ? (
            <><span className="text-[#f0a59c]">{over.length} of the {total} works</span> we track {over.length === 1 ? "is" : "are"} estimated to take more flow than {over.length === 1 ? "its" : "their"} permit allows</>
          ) : (
            <>None of the {total} works we track {total === 1 ? "is" : "are"} estimated to be over its permitted flow</>
          )}
          {atLimit.length > 0 && <>, and {atLimit.length} more {atLimit.length === 1 ? "has" : "have"} no headroom left</>}
          {affectedPop > 0 && <> — between them they serve about {affectedPop.toLocaleString()} people</>}.
          {unassessed.length > 0 && <> We are waiting to receive permits for <span className="text-[#e8c98a]">{unassessed.length} works</span> and hence cannot yet assess {unassessed.length === 1 ? "its" : "their"} capacity.</>}
        </p>
      </div>

      {/* stat cards */}
      <div className="flex flex-wrap gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="flex-[1_1_210px] rounded-[3px] border border-rh-line border-l-[4px] bg-rh-card px-5 py-4" style={{ borderLeftColor: c.accent }}>
            <div className="font-plexmono text-[32px] font-bold leading-none" style={{ color: c.accent }}>{c.value}</div>
            <div className="mt-1.5 text-[13.5px] font-semibold text-rh-ink">{c.label}</div>
            <div className="text-[12.5px] text-rh-ink3">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* works table */}
      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <div className="min-w-[860px]">
          <div className="flex gap-3.5 border-b border-rh-lineSoft bg-rh-cardAlt px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
            <div className="flex-[1_1_190px]">Works</div>
            <div className="flex-[0_0_150px]">Load against permit</div>
            <div className="flex-[0_0_110px]">Overflow at works</div>
            <div className="flex-[1_1_200px]">Spare capacity</div>
          </div>
          {rows.map((r) => {
            const permit = num(r.permit_dwf);
            return (
              <div key={r.system_id} className="flex gap-3.5 border-b border-rh-rowDiv px-[18px] py-3 hover:bg-rh-rowHover">
                {/* works */}
                <div className="flex-[1_1_190px]">
                  {r.works_asset_id ? (
                    <Link href={`/explore/spills/${r.works_asset_id}`} className="text-[14.5px] font-semibold text-rh-ink hover:text-rh-teal hover:underline">{prettyWorksName(r.system_name)}</Link>
                  ) : (
                    <div className="text-[14.5px] font-semibold text-rh-ink">{prettyWorksName(r.system_name)}</div>
                  )}
                  <div className="mt-0.5 font-plexmono text-[11px] text-rh-ink3">
                    {r.population != null && r.population > 0 ? `${r.population.toLocaleString()} people` : "population unknown"}
                    {permit != null ? ` · ${permit.toLocaleString()} m³/day permitted` : " · permit not found"}
                  </div>
                </div>
                {/* load */}
                <div className="flex-[0_0_150px]">
                  <LoadCell verdict={r.verdict} loadPct={r.load_pct} />
                </div>
                {/* overflow at works */}
                <div className="flex-[0_0_110px]">
                  {r.has_monitor ? (
                    <>
                      <div className="font-plexmono text-[13px] font-semibold text-rh-ink">{r.works_hours.toLocaleString()} h</div>
                      <div className="mt-0.5 text-[11px] text-rh-ink3">
                        {r.upstream_count} upstream{r.pre_stw_count > 0 ? ` · ${r.pre_stw_count.toLocaleString()} pre-STW` : ""}
                      </div>
                    </>
                  ) : (
                    <div className="font-plexmono text-[12.5px] text-rh-ink3">No monitor</div>
                  )}
                </div>
                {/* spare capacity */}
                <div className="flex-[1_1_200px]">
                  <SpareCell permit={r.permit_dwf} demand={r.demand_central} population={r.population} />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="px-[18px] py-8 text-center text-[13px] text-rh-ink3">No works data yet.</p>}
        </div>
      </div>

      <p className="max-w-[820px] text-[12px] text-rh-ink3">
        The black line marks 100% of permitted dry-weather flow; a dashed empty bar means no permit was found to measure against. Load is an estimate — population served × per-head water use, plus infiltration — not a permit-compliance finding. A works over 100% here is a signal to investigate, not a proven breach. Overflow hours are the works&apos; own storm overflow in the last full year.
      </p>

      {/* cannot-assess callout */}
      {unassessed.length > 0 && (
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-card px-[22px] py-4">
          <h2 className="text-[15px] font-bold text-rh-ink">{unassessed.length} works awaiting a permit</h2>
          <p className="mt-1 max-w-[720px] text-[13px] text-rh-ink2">
            We are still waiting to receive permits for {unassessed.map((r) => prettyWorksName(r.system_name)).slice(0, 6).join(", ")}{unassessed.length > 6 ? " and others" : ""}, so we cannot yet check whether {unassessed.length === 1 ? "it is" : "they are"} big enough for the population {unassessed.length === 1 ? "it serves" : "they serve"}. This is a gap in the public record — not a clean bill of health — and it is the quickest thing on this page to fix: the permitted flow is public information a water company must supply on request.
          </p>
        </div>
      )}

      {/* why this matters */}
      <div>
        <h2 className="mb-3 text-[16px] font-bold text-rh-ink">Why this matters for reading spills</h2>
        <div className="flex flex-wrap gap-3">
          <Explainer accent="#b8342a" title="Works over capacity" body="If a works cannot treat the flow it receives, it spills to protect itself. The remedy is capital investment or a lower permitted load — years and millions, but it is the water company's to fix." />
          <Explainer accent="#9a4415" title="Headroom, but still spills" body="A works with spare capacity whose network still spills points to another problem — often something on that branch, like a blockage, a failed pump, or groundwater getting into the sewer. Frequently cheap to fix, and fixable now." />
          <Explainer accent="#7d8a8c" title="No permit found" body="Where we cannot find the permitted flow, the works cannot be assessed at all. That is a gap in the public record, and closing it is the first step to holding capacity to account." />
        </div>
      </div>

      {/* how growth becomes spills */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="text-[16px] font-bold text-rh-ink">How growth becomes spills</h2>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          A developer has a section 106 right to connect to the public sewer, and the water company has a section 94 duty to accept the flow — but capacity is only funded on a five-yearly capital cycle. New connections can therefore arrive years before the works is enlarged to take them, and the overflow absorbs the gap. Schedule 3 to the Flood and Water Management Act 2010, which would make sustainable drainage mandatory and give a SuDS Approving Body a say, has been in force in Wales since 2018 but remains uncommenced in England — so here there is no such body.
        </p>
      </div>

      {/* what the permit actually sets */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[22px] py-5">
        <h2 className="text-[16px] font-bold text-rh-ink">What the permit actually sets</h2>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          The permitted dry-weather flow is set by Formula A — roughly <span className="font-plexmono text-[12.5px]">DWF + 1,360 × population + 2 × trade effluent</span> (litres/day). The permit also sets a flow to full treatment, typically about three times DWF, below which everything must be treated rather than spilled. Our load figure compares estimated demand against that permitted DWF. {noPermit === 1 ? "One works in the catchment publishes" : `${noPermit} works in the catchment publish`} no permitted flow at all, so their load cannot be calculated — they show as <em>not assessed</em>, never 0%.
        </p>
      </div>
      </PageBody>
    </>
  );
}

function LoadCell({ verdict, loadPct }: { verdict: Verdict; loadPct: number | null }) {
  if (verdict === "not_assessed" || loadPct == null) {
    return (
      <div>
        <div className="font-plexmono text-[13px] text-rh-ink3">Not known</div>
        <div className="mt-1.5 h-2 rounded-[2px] border border-dashed border-[#c9c3b5]" />
        <div className="mt-1.5"><VerdictChip verdict="not_assessed" /></div>
      </div>
    );
  }
  // bar scaled to 130%; 100% line at 76.9%
  const fillPct = Math.min(loadPct, 130) / 130 * 100;
  const barColor = verdict === "over" ? "#b8342a" : verdict === "limit" ? "#c07a12" : "#0d6b62";
  return (
    <div>
      <div className="font-plexmono text-[13px] font-semibold" style={{ color: barColor }}>{loadPct}%</div>
      <div className="relative mt-1.5 h-2 rounded-[2px] bg-rh-lineSoft">
        <div className="h-full rounded-[2px]" style={{ width: `${fillPct}%`, backgroundColor: barColor }} />
        <div className="absolute top-[-1px] bottom-[-1px] w-px bg-rh-ink" style={{ left: "76.9%" }} />
      </div>
      <div className="mt-1.5"><VerdictChip verdict={verdict} /></div>
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, { label: string; cls: string }> = {
    over: { label: "Over capacity", cls: "bg-rh-alarmTint text-rh-alarm border-[#e8b6ae]" },
    limit: { label: "At the limit", cls: "bg-[#fbf1de] text-[#8a5a0c] border-[#e8d3ab]" },
    within: { label: "Within capacity", cls: "bg-[#eaf1ef] text-rh-teal border-[#d3dedb]" },
    not_assessed: { label: "Not assessed", cls: "bg-[#f0efe9] text-rh-ink3 border-rh-line" },
  };
  const { label, cls } = map[verdict];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

// Spare capacity as people the works could still take before its permitted flow (see @/lib/capacity).
function SpareCell({ permit, demand, population }: { permit: number | string | null; demand: number | string | null; population: number | null }) {
  const extra = sparePeople(permit, demand, population);
  if (extra == null) return <span className="text-[12.5px] text-rh-ink3">Not known</span>;
  if (extra <= 0) {
    return (
      <div>
        <div className="text-[13px] font-semibold text-rh-ink2">None</div>
        <div className="text-[11.5px] text-rh-ink3">at or over its permit</div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-plexmono text-[14px] font-semibold text-rh-teal">{fmtSpare(extra)}</div>
      <div className="text-[11.5px] text-rh-ink3">more people it could serve</div>
    </div>
  );
}

function Explainer({ accent, title, body }: { accent: string; title: string; body: string }) {
  return (
    <div className="flex-[1_1_260px] rounded-[3px] border border-rh-line border-l-[4px] bg-rh-card px-[18px] py-4" style={{ borderLeftColor: accent }}>
      <h3 className="text-[14px] font-bold text-rh-ink">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-[1.55] text-rh-ink2">{body}</p>
    </div>
  );
}
