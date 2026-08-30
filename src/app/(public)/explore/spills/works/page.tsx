import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Works & capacity — ${INSTANCE.portalName}`,
  description: `Is each treatment works big enough for the area it serves? Load against permitted flow across the ${INSTANCE.riverName} catchment, and what the spill record points to.`,
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

  return (
    <div className="space-y-6 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>

      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Works & capacity</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">
          Every overflow drains to a treatment works that serves a fixed area. When a works is too small for the flow it receives, spills follow. This crosses each works&apos; estimated load against its permitted flow — and against the spill record — to say what the numbers point to.
        </p>
      </div>

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
          {unassessed.length > 0 && <> A further <span className="text-[#e8c98a]">{unassessed.length} cannot be assessed at all</span>, because we have not found a permit or a population estimate for {unassessed.length === 1 ? "it" : "them"}.</>}
        </p>
      </div>

      {/* works table */}
      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <div className="min-w-[860px]">
          <div className="flex gap-3.5 border-b border-rh-lineSoft bg-rh-cardAlt px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
            <div className="flex-[1_1_190px]">Works</div>
            <div className="flex-[0_0_150px]">Load against permit</div>
            <div className="flex-[0_0_110px]">Overflow at works</div>
            <div className="flex-[1_1_200px]">What that points to</div>
          </div>
          {rows.map((r) => {
            const permit = num(r.permit_dwf);
            return (
              <div key={r.system_id} className="flex gap-3.5 border-b border-rh-rowDiv px-[18px] py-3 hover:bg-rh-rowHover">
                {/* works */}
                <div className="flex-[1_1_190px]">
                  <div className="text-[14.5px] font-semibold text-rh-ink">{r.system_name}</div>
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
                {/* diagnosis */}
                <div className="flex-[1_1_200px]">
                  <DiagnosisCell diagnosis={r.diagnosis} />
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
          <h2 className="text-[15px] font-bold text-rh-ink">{unassessed.length} works we cannot assess</h2>
          <p className="mt-1 max-w-[720px] text-[13px] text-rh-ink2">
            For {unassessed.map((r) => r.system_name.split("_")[0]).slice(0, 6).join(", ")}{unassessed.length > 6 ? " and others" : ""} we have no permit or no population estimate on record, so we cannot check whether the works is big enough. This is a gap in the public record — not a clean bill of health — and it is the quickest thing on this page to fix: the permitted flow is public information a water company must supply on request.
          </p>
        </div>
      )}

      {/* why this matters */}
      <div>
        <h2 className="mb-3 text-[16px] font-bold text-rh-ink">Why this matters for reading spills</h2>
        <div className="flex flex-wrap gap-3">
          <Explainer accent="#b8342a" title="Works over capacity" body="If a works cannot treat the flow it receives, it spills to protect itself. The remedy is capital investment or a lower permitted load — years and millions, but it is the water company's to fix." />
          <Explainer accent="#9a4415" title="Headroom, but upstream spills anyway" body="A works with spare capacity whose network still spills points upstream — a blockage, a failed pump, or groundwater getting into the sewer. Often cheap to fix, and fixable now." />
          <Explainer accent="#7d8a8c" title="No permit found" body="Where we cannot find the permitted flow, the works cannot be assessed at all. That is a gap in the public record, and closing it is the first step to holding capacity to account." />
        </div>
      </div>
    </div>
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

function DiagnosisCell({ diagnosis }: { diagnosis: Diagnosis }) {
  const map: Record<Diagnosis, { title: string; note: string; color: string } | null> = {
    capacity: { title: "Treatment capacity", note: "Needs investment or a lower permit", color: "#b8342a" },
    upstream: { title: "Network faults upstream", note: "Blockages, failed pumps or infiltration", color: "#9a4415" },
    both: { title: "Both", note: "A capacity problem and upstream faults", color: "#8a2f6b" },
    not_assessed: { title: "Not assessed", note: "Permit or population missing", color: "#7d8a8c" },
    none: null,
  };
  const d = map[diagnosis];
  if (!d) return <span className="text-[12.5px] text-rh-ink3">No capacity signal</span>;
  return (
    <div className="border-l-[3px] pl-2.5" style={{ borderColor: d.color }}>
      <div className="text-[13px] font-semibold" style={{ color: d.color }}>{d.title}</div>
      <div className="text-[11.5px] text-rh-ink3">{d.note}</div>
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
