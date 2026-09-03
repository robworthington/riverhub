import Link from "next/link";
import type { Metadata } from "next";
import { cachedRpc } from "@/lib/publicData";
import { INSTANCE } from "@/lib/instance";
import { StatCard } from "@/components/public/StatCard";
import { PeriodBar } from "@/components/public/PeriodBar";
import { SpillsBoardTable } from "@/components/public/SpillsBoardTable";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { derive, fmtDuration, fmtAge, fmtWhen, type BoardRow } from "@/lib/spillStatus";
import { OverflowName } from "@/components/public/OverflowName";
import { overflowLabel, prettyWorksName } from "@/lib/overflowNames";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Sewage spills — ${INSTANCE.portalName}`,
  description: `Which storm overflows are spilling into the ${INSTANCE.riverName} right now, and which are spilling when they shouldn't. Live status and Environment Agency EDM records.`,
};

export default async function PublicSpillsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;

  // The board reads ?period=, so it stays dynamic; cache the RPC results (10 min) so a traffic spike is
  // served from the data cache instead of running these aggregates against Postgres on every request.
  // period bar range from the real per-event data (spill_events), not the lagging annual returns
  const rangeData = await cachedRpc<{ min_year: number | null; max_year: number | null }>("public_spill_year_range");
  const range = rangeData[0];
  const maxYear = range?.max_year ?? new Date().getUTCFullYear();
  const minYear = range?.min_year ?? 2020;

  const isAll = sp.period === "all";
  const pYear = isAll ? null : sp.period && /^\d{4}$/.test(sp.period) ? Number(sp.period) : maxYear;
  const periodValue = isAll ? "all" : String(pYear);
  const periodLabel = isAll ? "All years" : String(pYear);

  const periods = [];
  for (let y = maxYear; y >= minYear; y--) periods.push({ value: String(y), label: y === maxYear ? `${y} so far` : String(y) });
  periods.push({ value: "all", label: "All years" });

  const rows = await cachedRpc<BoardRow>("public_spills_board", { p_year: pYear });
  const nowMs = Date.now();

  // Emergency overflows are a separate, non-live class — surface a pointer so the board isn't read as the whole picture.
  const eoSum = await cachedRpc<{ eo_count: number; active_count: number; lfy: number | null; hours_lfy: number | null }>("public_eo_summary");
  const eo = eoSum[0] ?? null;

  const spillingNow = rows.filter((r) => derive(r, nowMs).status === "spilling");
  const stoppedRecently = rows.filter((r) => derive(r, nowMs).status === "recent").length;
  const dryTotal = rows.reduce((s, r) => s + r.dry, 0);
  const feedsDown = rows.filter((r) => derive(r, nowMs).feed !== "reporting").length;
  const lastUpdated = rows.reduce<number | null>((m, r) => {
    const t = r.last_updated ? Date.parse(r.last_updated) : null;
    return t != null && (m == null || t > m) ? t : m;
  }, null);
  // last successful sync = the most recent snapshot capture across all assets
  const syncAgeMin = lastUpdated != null ? Math.max(0, Math.round((nowMs - lastUpdated) / 60000)) : null;
  const syncStale = syncAgeMin == null || syncAgeMin > 180; // hourly cadence + generous slack
  const syncDead = syncAgeMin == null || syncAgeMin > 1440; // no update in over a day → pipeline down

  return (
    <>
      <PageHeaderBand
        title="Sewage spills"
        intro={`Which storm overflows are spilling into the ${INSTANCE.riverName} right now, and which ones are spilling when they shouldn’t.`}
      />
      <PageBody className="space-y-7">
      <AutoRefresh minutes={10} />

      {/* condensed intro (design 2b): lands the argument on arrival without pushing the data down */}
      <div className="flex flex-col gap-9 border-b border-brand-line pb-7 lg:flex-row lg:items-start">
        <div className="flex max-w-[74ch] flex-1 flex-col gap-3">
          <p className="text-[17.5px] font-bold leading-[1.5] text-brand-text">
            Your bill went up by about a third to fix this. There is no public plan showing how.
          </p>
          <p className="text-[16px] leading-[1.7] text-brand-body [text-wrap:pretty]">
            River Hub is a volunteer attempt to build the evidence a plan would need — which assets fail, how often, and
            whether they can serve the people connected to them. We don’t claim to have the right answers. We are showing
            that these questions can be answered in the open, and that the regulator and water companies should be the ones
            answering them.
          </p>
          <Link href="/explore/spills/why-river-hub" className="text-[15px] font-semibold text-brand-navy hover:underline">
            Why we built this, and what it tells us →
          </Link>
        </div>
        <div className="flex flex-col gap-2.5 rounded-[6px] bg-brand-navyDeep px-6 py-[22px] lg:w-[300px] lg:shrink-0">
          <span className="font-serif text-[17px] font-bold leading-[1.3] text-white">Scale this to every river</span>
          <span className="text-[14px] leading-[1.6] text-brand-onNavy2">The window to influence the next round of national spending is closing.</span>
          <a href={INSTANCE.donateUrl} target="_blank" rel="noopener" className="mt-1 self-start rounded-[4px] bg-white px-5 py-3 text-[14px] font-semibold text-brand-navyDeep transition-colors hover:bg-brand-onNavy">
            Donate
          </a>
        </div>
      </div>

      {/* freshness — last successful automated sync, flagged when stale */}
      <p className="font-plexmono text-[11.5px]">
        <span className={syncStale ? "font-semibold text-rh-alarm" : "text-rh-teal"}>
          {lastUpdated ? `Last successful sync ${fmtAge(syncAgeMin)} ago` : "No successful sync yet"}
        </span>
        <span className="text-rh-ink3"> · {rows.length} assets tracked · feeds polled hourly</span>
      </p>

      {/* pipeline-down banner: the automated sync has not run for over a day */}
      {syncDead && (
        <div className="rounded-[3px] border border-[#e8b6ae] bg-rh-alarmTint px-[18px] py-3 text-[13px] text-rh-alarm">
          <strong>The automated feed hasn&apos;t updated {lastUpdated ? `in ${fmtAge(syncAgeMin)}` : "yet"}.</strong>{" "}
          <span className="text-rh-ink2">Everything below is the last known state as of {lastUpdated ? fmtWhen(new Date(lastUpdated).toISOString()) : "—"} — it is not live and should not be read as current. The hourly sync appears to have stopped.</span>
        </div>
      )}

      <PeriodBar periods={periods} current={periodValue} />

      {/* stat cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          accent="alarm"
          value={spillingNow.length}
          caption="Spilling now"
          subline={spillingNow.length ? spillingNow.slice(0, 3).map((r) => overflowLabel(r.asset_name, r.asset_type)).join(", ") + (spillingNow.length > 3 ? "…" : "") : "Nothing discharging right now"}
        />
        <StatCard accent="amber" value={stoppedRecently} caption="Stopped in last 48 hours" subline="Bacteria can persist for days" />
        <StatCard accent="dry" value={dryTotal.toLocaleString()} caption={`Dry spills, ${periodLabel}`} subline="Spilled with no rain — usually a fault" />
        <StatCard accent="nodata" value={feedsDown} caption="Feeds not reporting" subline="No data means no reassurance" />
      </div>

      {/* spilling right now */}
      {spillingNow.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-rh-pulse rounded-full bg-rh-alarm" />
            <h2 className="text-[15px] font-bold uppercase tracking-[.06em] text-rh-ink">Spilling right now</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {spillingNow.map((r) => {
              const d = derive(r, nowMs);
              return (
                <Link
                  key={r.asset_id}
                  href={`/explore/spills/${r.asset_id}`}
                  className="flex-[1_1_300px] rounded-[3px] border border-[#e8b6ae] bg-rh-alarmTint px-5 py-[18px] hover:border-rh-alarm"
                >
                  <div className="font-plexmono text-[12px] text-rh-alarm">SPILLING · {fmtDuration(d.spillMinutes)}</div>
                  <div className="mt-1 text-[19px] font-bold text-rh-ink"><OverflowName raw={r.asset_name} type={r.asset_type} /></div>
                  {r.system_name && <div className="text-[12.5px] text-rh-ink2">at {prettyWorksName(r.system_name)}</div>}
                  <div className="mt-2 border-t border-[#ecd3ce] pt-2 text-[12px] text-rh-ink3">
                    Started {fmtWhen(r.status_start ?? r.latest_event_start)}
                  </div>
                  <div className="mt-1.5 text-[12.5px] font-semibold text-rh-alarm">See history →</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <SpillsBoardTable rows={rows} periodLabel={periodLabel} nowMs={nowMs} />

      {/* pointer to the emergency-overflow record — a class of discharge absent from the live feed above */}
      {eo && eo.eo_count > 0 && (
        <Link
          href="/explore/spills/emergency-overflows"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border border-rh-line border-l-[4px] border-l-[#6b4a8f] bg-rh-card px-[22px] py-4 hover:bg-rh-rowHover"
        >
          <span className="font-plexmono text-[26px] font-bold leading-none text-[#6b4a8f]">{eo.eo_count}</span>
          <span className="flex-1 text-[13.5px] text-rh-ink2">
            <strong className="text-rh-ink">emergency overflows</strong> also discharge to the {INSTANCE.riverName}, and are not in the feed above
            {eo.hours_lfy != null && eo.lfy ? ` — ${Math.round(eo.hours_lfy).toLocaleString()} hours between them in ${eo.lfy}` : ""}. Obtained by EIR request.
          </span>
          <span className="text-[12.5px] font-semibold text-rh-teal">See the record →</span>
        </Link>
      )}
      </PageBody>
    </>
  );
}
