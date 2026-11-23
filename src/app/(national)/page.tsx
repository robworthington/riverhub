import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { RiverChooser } from "@/components/national/RiverChooser";
import { NationalMap } from "@/components/national/NationalMap";
import type { DistrictShape, NationalDistrict, NationalHome, NationalRiver } from "@/lib/national-data";

// Cached for 10 min (ISR). Every figure comes from the hourly-refreshed rollup (migration 0097), so a
// render is a few small reads; the live counts are at most an hour plus ten minutes old, and the page
// says when they were last updated.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "River Hub — England's rivers, in the open",
  description:
    "Live sewage spills, the record and who is fixing it, for rivers across England, maintained by local volunteer groups.",
};

type Summary = { rivers: number; overflows: number; gaps: number; dry: number };

const card = "flex flex-col gap-1.5 rounded-[6px] border px-[18px] py-4";
const big = "font-plexmono text-[28px] font-bold leading-none sm:text-[30px]";

function Figure({
  value, label, note, tone = "plain",
}: {
  value: string; label: string; note?: React.ReactNode; tone?: "plain" | "alarm" | "dry" | "prestw";
}) {
  const box = {
    plain: "border-brand-line2 bg-white",
    alarm: "border-brand-line2 bg-white",
    dry: "border-rh-dryPanelBorder bg-rh-dryPanel",
    prestw: "border-rh-prestwPanelBorder bg-rh-prestwPanel",
  }[tone];
  const num = { plain: "text-brand-navyDeep", alarm: "text-rh-alarmDeep", dry: "text-rh-dryDeep", prestw: "text-rh-prestw" }[tone];
  return (
    <div className={`${card} ${box}`}>
      <span className={`${big} ${num}`}>{value}</span>
      <span className="text-[13.5px] font-semibold text-brand-text">{label}</span>
      {note && <span className="text-[12.5px] leading-[1.45] text-brand-body">{note}</span>}
    </div>
  );
}

/** "17:58", or "17:58 on 22 Nov" when it isn't today (UK time). */
function asOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const tz = "Europe/London";
  const time = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: tz });
  return day(d) === day(new Date()) ? time : `${time} on ${d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" })}`;
}

function League({ title, rows, tone }: { title: string; rows: { slug: string; name: string; v: number; href: string }[]; tone: "alarm" | "dry" }) {
  return (
    <div className="min-w-0 flex-[1_1_420px] space-y-2.5">
      <h2 className="font-serif text-[20px] font-bold text-brand-navyDeep">{title}</h2>
      <ol className="divide-y divide-brand-line rounded-[6px] border border-brand-line2 text-[14px]">
        {rows.map((r) => (
          <li key={r.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <a href={r.href} className="font-semibold text-brand-navy hover:underline">{r.name}</a>
            <span className={`font-plexmono font-bold ${tone === "alarm" ? "text-rh-alarm" : "text-rh-dryDeep"}`}>{r.v.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function NationalHomePage() {
  const supabase = createPublicClient();
  const [homeRows, sumRows, rivers, districts, shapes] = await Promise.all([
    publicRpc<NationalHome>(supabase, "national_home"),
    publicRpc<Summary>(supabase, "national_summary"),
    publicRpc<NationalRiver>(supabase, "national_rivers"),
    publicRpc<NationalDistrict>(supabase, "national_districts"),
    publicRpc<DistrictShape>(supabase, "national_district_shapes"),
  ]);
  const h = homeRows[0] ?? null;
  const s = sumRows[0] ?? null;

  const reductionPct = h && h.baseline_spills > 0 ? Math.round(((h.baseline_spills - h.latest_spills) / h.baseline_spills) * 100) : null;
  const spilling = [...rivers].filter((r) => (r.spilling_now ?? 0) > 0).sort((a, b) => (b.spilling_now ?? 0) - (a.spilling_now ?? 0));
  const topSpilling = spilling.slice(0, 10);
  const maxSpill = topSpilling[0]?.spilling_now ?? 0;
  const gapsLeague = rivers.filter((r) => r.gaps > 0).slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.river_name, v: r.gaps, href: `/r/${r.slug}/explore/spills/gaps` }));
  const dryLeague = [...rivers].filter((r) => r.dry > 0).sort((a, b) => b.dry - a.dry).slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.river_name, v: r.dry, href: `/r/${r.slug}/explore/spills/why/dry` }));
  const updated = asOf(h?.live_as_of ?? null);
  // Feed freshness at render time. Feeds sync hourly: over 3 h behind, say the figures may be out of
  // date; over 24 h (the live board's "feed down" threshold), don't present a count as current at all.
  const liveAgeH = h?.live_as_of ? (Date.now() - Date.parse(h.live_as_of)) / 3_600_000 : null;
  const liveState: "fresh" | "stale" | "down" | "none" =
    !h || h.monitors === 0 || liveAgeH == null ? "none" : liveAgeH > 24 ? "down" : liveAgeH > 3 ? "stale" : "fresh";
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="max-w-[62ch] space-y-3">
          <h1 className="font-serif text-[34px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-navyDeep sm:text-[44px]">
            England&rsquo;s rivers, in the open
          </h1>
          <p className="text-[17px] leading-[1.6] text-brand-body">
            Live sewage spills, the record, and who is fixing it, from open data maintained by local volunteer
            groups, river by river.
          </p>
        </div>
        {liveState === "down" && (
          <div role="status" className="rounded-[6px] border border-rh-chipAmberBorder bg-rh-chipAmberBg px-5 py-4 text-[14.5px] text-brand-text">
            Live spill status is unavailable: the water company feeds haven&rsquo;t updated since {updated}. The record
            below is unaffected.
          </div>
        )}
        {h && (liveState === "fresh" || liveState === "stale") && (
          <div role="status" className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-[6px] border border-rh-alarmBorder bg-rh-alarmTint px-5 py-4">
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span aria-hidden="true" className="h-2.5 w-2.5 self-center rounded-full bg-rh-alarm shadow-[0_0_0_4px_rgba(184,52,42,.18)]" />
              <span className="font-plexmono text-[30px] font-bold leading-none text-rh-alarmDeep">{h.spilling_now.toLocaleString()}</span>
              <span className="text-[16px] text-brand-text">
                {liveState === "fresh" ? "overflows spilling right now" : "overflows spilling at the last update"}, into{" "}
                <strong>{h.rivers_spilling} of {h.rivers}</strong> rivers
              </span>
            </span>
            <span className="text-[14px] text-brand-body">
              <strong className="font-plexmono text-rh-amber">{h.stopped_48h.toLocaleString()}</strong> stopped in the last 48 hours
            </span>
            <span className="text-[14px] text-brand-body">
              <strong className="font-plexmono text-brand-navyDeep">{h.reporting.toLocaleString()}</strong> of {h.monitors.toLocaleString()} monitors reporting
            </span>
            {updated && (
              <span className={`text-[12.5px] sm:ml-auto ${liveState === "stale" ? "font-semibold text-rh-amber" : "text-brand-label"}`}>
                {liveState === "stale" ? `Feeds last updated ${updated}: figures may be out of date` : `Water company feeds · updated ${updated}`}
              </span>
            )}
          </div>
        )}
        {!h && s && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure value={s.rivers.toLocaleString()} label="rivers covered" />
            <Figure value={s.overflows.toLocaleString()} label="overflows tracked" />
            <Figure value={s.gaps.toLocaleString()} label="gaps: flagged, no measure on record" tone="alarm" />
            <Figure value={s.dry.toLocaleString()} label="dry-weather spills since 2020" />
          </div>
        )}
      </section>

      <section aria-labelledby="map-h" className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[1_1_560px] space-y-2.5">
          <h2 id="map-h" className="font-serif text-[24px] font-bold text-brand-navyDeep">Find your river</h2>
          {shapes.length > 0 ? (
            <NationalMap districts={shapes} rivers={rivers} />
          ) : (
            <p className="text-[14px] text-brand-body">The map is unavailable right now. Choose a river from the list below.</p>
          )}
          <p className="text-[13px] text-brand-muted">
            Click a district to see its rivers, or a river to open it. Prefer a list?{" "}
            <a href="#choose" className="text-brand-navy hover:underline">Choose a river below</a>.
          </p>
        </div>

        {topSpilling.length > 0 && (
          <aside aria-labelledby="now-h" className="min-w-[280px] flex-[0_1_340px] space-y-2.5">
            <h2 id="now-h" className="font-serif text-[20px] font-bold text-brand-navyDeep">Spilling now, by river</h2>
            <ol className="divide-y divide-brand-line3 rounded-[6px] border border-brand-line2">
              {topSpilling.map((r) => (
                <li key={r.slug}>
                  <a href={`/r/${r.slug}/explore/spills`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 px-3.5 py-2.5 hover:bg-brand-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-navy">
                    <span className="truncate text-[14.5px] font-semibold text-brand-navyDeep">{r.river_name}</span>
                    <span className="text-right font-plexmono text-[14px] font-bold text-rh-alarmDeep">{r.spilling_now}</span>
                    <span aria-hidden="true" className="col-span-2 h-[5px] rounded-full bg-[#F1E3E0]">
                      <span className="block h-full rounded-full bg-rh-alarm" style={{ width: `${maxSpill > 0 ? Math.max(4, ((r.spilling_now ?? 0) / maxSpill) * 100) : 0}%` }} />
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            {spilling.length > topSpilling.length && (
              <a href="#choose" className="block text-[14px] font-semibold text-brand-navy hover:underline">
                {spilling.length - topSpilling.length} more rivers spilling: see all rivers ↓
              </a>
            )}
            <p className="text-[12.5px] leading-[1.5] text-brand-label">
              &ldquo;Now&rdquo; means the overflow&rsquo;s monitor reports a spill and has reported in the last 24 hours.
            </p>
          </aside>
        )}
      </section>

      {h && (
        <section aria-labelledby="rec-h" className="space-y-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="rec-h" className="font-serif text-[24px] font-bold text-brand-navyDeep">The record</h2>
            <span className="text-[13px] text-brand-label">Across the {h.rivers} rivers River Hub covers</span>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            <Figure
              value={h.latest_spills.toLocaleString()}
              label="spills last full year"
              note={reductionPct != null ? <>{reductionPct >= 0 ? `Down ${reductionPct}%` : `Up ${-reductionPct}%`} on the 2020 baseline of {h.baseline_spills.toLocaleString()}, counted the Environment Agency&rsquo;s way</> : undefined}
            />
            <Figure
              value={h.hours_lfy.toLocaleString()}
              label="hours of spilling last full year"
              note={h.hours_lfy >= 8766 ? <>Equal to {Math.round(h.hours_lfy / 8766)} years of continuous discharge</> : undefined}
            />
            <Figure value={h.dry.toLocaleString()} label="dry-weather spills since 2020" note="No meaningful rain that day or the day before" tone="dry" />
            <Figure value={h.pre_stw.toLocaleString()} label="spills before the works" note="Overflows upstream spilling while their treatment works wasn't" tone="prestw" />
          </div>
        </section>
      )}

      {h && (
        <section aria-labelledby="fix-h" className="space-y-3.5">
          <h2 id="fix-h" className="font-serif text-[24px] font-bold text-brand-navyDeep">Who is fixing it</h2>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            <Figure value={h.gaps.toLocaleString()} label="gaps: flagged, no measure on record" note={<>{pct(h.gaps, h.overflows)}% of the {h.overflows.toLocaleString()} overflows tracked</>} tone="alarm" />
            <Figure value={h.winep_actions.toLocaleString()} label="actions the regulator requires" note={<>{h.winep_due_2030.toLocaleString()} due by 31 March 2030 (WINEP)</>} />
            <Figure value={h.bathing_waters.toLocaleString()} label="bathing waters downstream" note={<>{h.overflows_to_bathing.toLocaleString()} overflows discharge towards them</>} />
            <Figure value={h.shellfish_waters.toLocaleString()} label="shellfish waters downstream" note="Designated for shellfish harvesting" />
          </div>
        </section>
      )}

      {(gapsLeague.length > 0 || dryLeague.length > 0) && (
        <section className="flex flex-wrap gap-6">
          {gapsLeague.length > 0 && <League title="Where the gaps are widest" rows={gapsLeague} tone="alarm" />}
          {dryLeague.length > 0 && <League title="Most dry-weather spills" rows={dryLeague} tone="dry" />}
        </section>
      )}

      {/* River basin districts — the regional lens (each links to its /d/<slug> page) */}
      {districts.length > 0 && (
        <section className="space-y-4">
          <div className="max-w-[60ch] space-y-1.5">
            <h2 className="font-serif text-[24px] font-bold text-brand-navyDeep">England&rsquo;s river basin districts</h2>
            <p className="text-[14px] leading-[1.55] text-brand-body">
              The Environment Agency plans and reports river health by river basin district. Open a district
              to compare the rivers River Hub covers there.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {districts.map((d) =>
              d.rivers > 0 ? (
                <li key={d.slug}>
                  <Link
                    href={`/d/${d.slug}`}
                    className="flex h-full flex-col gap-1.5 rounded-[6px] border border-brand-line2 bg-white px-5 py-4 transition-colors hover:border-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                  >
                    <span className="font-serif text-[18px] font-bold text-brand-navyDeep">{d.name}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-brand-body">
                      <span><strong className="font-plexmono text-brand-navyDeep">{d.rivers}</strong> {d.rivers === 1 ? "river" : "rivers"}</span>
                      <span><strong className="font-plexmono text-rh-alarm">{d.gaps}</strong> gaps</span>
                    </span>
                    {d.companies.length > 0 && <span className="text-[12px] text-brand-label">{d.companies.join(" · ")}</span>}
                  </Link>
                </li>
              ) : (
                <li key={d.slug} className="flex flex-col gap-1 rounded-[6px] border border-dashed border-brand-dashed px-5 py-4">
                  <span className="font-serif text-[17px] font-bold text-brand-label">{d.name}</span>
                  <span className="text-[12.5px] text-brand-placeholder">Not yet covered</span>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      <section id="choose" className="scroll-mt-6 space-y-4">
        <div className="max-w-[60ch] space-y-1.5">
          <h2 className="font-serif text-[24px] font-bold text-brand-navyDeep">Choose a river</h2>
          <p className="text-[14px] leading-[1.55] text-brand-body">
            Pick a catchment to see live spill status, the gaps, treatment-works capacity and what the
            regulator requires. Your river not here?{" "}
            <a href="mailto:hello@riverhub.org?subject=River%20Hub%20—%20cover%20my%20river" className="text-brand-navy hover:underline">Register interest →</a>
          </p>
        </div>
        <RiverChooser rivers={rivers} />
      </section>
    </div>
  );
}
