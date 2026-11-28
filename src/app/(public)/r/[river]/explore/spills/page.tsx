import { RiverLink } from "@/components/public/RiverLink";
import type { Metadata } from "next";
import { cachedRpc } from "@/lib/publicData";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { StatusDot } from "@/components/public/StatusDot";
import { WhatWeKnow } from "@/components/public/WhatWeKnow";
import { GroupStrip } from "@/components/public/GroupStrip";
import { SupportCard } from "@/components/public/SupportCard";
import { PublishedRequests } from "@/components/public/PublishedRequests";
import { StatCard } from "@/components/public/StatCard";
import { PeriodBar } from "@/components/public/PeriodBar";
import { SpillsBoardTable } from "@/components/public/SpillsBoardTable";
import { PetitionCta } from "@/components/public/PetitionCta";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { derive, fmtDuration, fmtAge, fmtWhen, type BoardRow } from "@/lib/spillStatus";
import { OverflowName } from "@/components/public/OverflowName";
import { overflowLabel, prettyWorksName } from "@/lib/overflowNames";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { SpillHistoryNote } from "@/components/public/SpillHistoryNote";
import { LiveSourceCredit } from "@/components/public/LiveSourceCredit";
import { ShareButton } from "@/components/public/ShareButton";
import { SafetyLine } from "@/components/public/SafetyLine";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
  title: `Sewage spills — ${b.portalName}`,
  description: `Which storm overflows are spilling into the ${b.riverName} right now, and which are spilling when they shouldn't. Live status and ${b.nation === "wales" ? "annual returns" : "Environment Agency EDM records"}.`,
  };
}

export default async function PublicSpillsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const b = await getBranding();
  const river = await getCurrentRiver();
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

  // the river's groups (strip + quieter support box) and published volunteer sites (rail card)
  const [groups, volSites] = river
    ? await Promise.all([
        cachedRpc<{ name: string; donate_url: string | null }>("public_river_groups", { p_org: river.orgId }).catch(() => []),
        cachedRpc<{ id: string }>("public_volunteer_sites", { p_org: river.orgId }).catch(() => []),
      ])
    : [[], []];

  const spillingNow = rows.filter((r) => derive(r, nowMs).status === "spilling");
  const stoppedRecently = rows.filter((r) => derive(r, nowMs).status === "recent").length;
  const dryTotal = rows.reduce((s, r) => s + r.dry, 0);
  const countedTotal = rows.reduce((s, r) => s + (r.counted ?? r.total), 0);
  const eventsTotal = rows.reduce((s, r) => s + r.total, 0);
  const feedsDown = rows.filter((r) => derive(r, nowMs).feed !== "reporting").length;
  // last_updated is our poll time (captured_at) per migration 0062/0077 — SWW's own timestamp only
  // bumps on a status change, so it can't be used for freshness. The most recent poll across assets is
  // the sync's health.
  const lastUpdated = rows.reduce<number | null>((m, r) => {
    const t = r.last_updated ? Date.parse(r.last_updated) : null;
    return t != null && (m == null || t > m) ? t : m;
  }, null);
  const syncAgeMin = lastUpdated != null ? Math.max(0, Math.round((nowMs - lastUpdated) / 60000)) : null;
  const syncStale = syncAgeMin == null || syncAgeMin > 180; // hourly cadence + generous slack
  const syncDead = syncAgeMin == null || syncAgeMin > 1440; // no successful poll in over a day → pipeline down

  // Share message: the same figures as the board and its card (riverLive reads these rows), factual and
  // attributed. When the feeds are down it shares the record rather than a stale count.
  const shareAt = lastUpdated != null
    ? new Date(lastUpdated).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })
    : null;
  const monitorsOf = b.companyName ? `${b.companyName}'s own monitors` : "the water company's own monitors";
  const shareText = !syncDead && shareAt
    ? `${spillingNow.length} of the ${b.riverName}'s ${rows.length} sewage overflows were spilling at ${shareAt}, according to ${monitorsOf}. Live picture:`
    : `The ${b.riverName}'s ${rows.length} sewage overflows: which are spilling, and which spill when they shouldn't. From ${monitorsOf}:`;

  return (
    <>
      <PageHeaderBand
        title="Sewage spills"
        intro={`Which storm overflows are spilling into the ${b.riverName} right now, and which ones are spilling when they shouldn’t.`}
        action={
          // Share, then the support box at the level of the banner (Nov 2026). On a group's river the
          // group strip asks for the group, so River Hub's own ask is a quieter line.
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <ShareButton
              path={`/r/${b.slug}/explore/spills`}
              title={`Share the ${b.riverName}, right now`}
              text={shareText}
              card="live"
              subject={`Sewage spills on the ${b.riverName}, right now`}
            />
            <SupportCard riverName={b.riverName} quiet={groups.length > 0} />
          </div>
        }
      />
      <PageBody className="space-y-6 pb-12 lg:pb-0">
        <SpillHistoryNote />
      <AutoRefresh minutes={10} />

      {/* the group that looks after the river (renders nothing on a river no group looks after) */}
      {river && <GroupStrip orgId={river.orgId} riverName={b.riverName} />}

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="min-w-0 space-y-7">

      {/* freshness — last successful automated sync (our poll time), flagged when stale */}
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
        <StatCard accent="ink" value={countedTotal.toLocaleString()} caption={`Counted spills, ${periodLabel}`} subline={`12/24-hour counting method · ${eventsTotal.toLocaleString()} discharge events`} />
        <StatCard accent="dry" value={dryTotal.toLocaleString()} caption={`Dry spills, ${periodLabel}`} subline="Spilled with no rain — usually a fault" />
        <StatCard accent="nodata" value={feedsDown} caption="Feeds not reporting" subline="No data means no reassurance" />
      </div>
      <SafetyLine className="-mt-3" />

      {/* spilling right now */}
      {spillingNow.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusDot status="spilling" size={10} />
            <h2 className="text-[15px] font-bold uppercase tracking-[.06em] text-rh-ink">Spilling right now</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {spillingNow.map((r) => {
              const d = derive(r, nowMs);
              return (
                <RiverLink
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
                </RiverLink>
              );
            })}
          </div>
        </section>
      )}

      <SpillsBoardTable rows={rows} periodLabel={periodLabel} nowMs={nowMs} />

      {/* information requests the group has published (renders nothing when there are none) */}
      {river && <PublishedRequests orgId={river.orgId} riverName={b.riverName} groupName={b.groupName} />}

      <LiveSourceCredit companyName={b.companyName} />
      </div>

      {/* side rail (Nov 2026): what's known, volunteer testing, the petition; stays in view on desktop,
          stacks under the board on phones */}
      <aside className="space-y-4 lg:sticky lg:top-4">
        {river && <WhatWeKnow orgId={river.orgId} riverName={b.riverName} variant="rail" />}
        {volSites.length > 0 && (
          <RiverLink href="/explore/health/volunteer" className="block rounded-[6px] border border-rh-line bg-rh-card px-4 py-3.5 hover:bg-rh-rowHover">
            <span className="block text-[15px] font-bold text-rh-ink">Volunteer testing</span>
            <span className="block text-[12.5px] leading-[1.5] text-rh-ink2">
              {volSites.length} sampling {volSites.length === 1 ? "site" : "sites"} on the {b.riverName}, with bathing-water classes. See the results →
            </span>
          </RiverLink>
        )}
        <div className="hidden lg:block"><PetitionCta variant="rail" /></div>
      </aside>
      </div>

      {/* phones: the petition as a slim bar along the bottom, once per visit */}
      <PetitionCta variant="bar" />
      </PageBody>
    </>
  );
}
