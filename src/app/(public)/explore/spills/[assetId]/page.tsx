import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { MixBar } from "@/components/public/MixBar";
import { Chip } from "@/components/public/Chip";
import { StatusDot } from "@/components/public/StatusDot";
import { WatchlistButton } from "@/components/public/WatchlistButton";
import { derive, fmtDuration, fmtAge, fmtWhen, type BoardRow } from "@/lib/spillStatus";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";
import { actionTypeFromDriver, ACTION_TYPE_META, measureRequirement } from "@/lib/winep";
import { type EoForSystem, fmtHours, eoDisplayName } from "@/lib/emergencyOverflows";
import { OverflowName } from "@/components/public/OverflowName";
import { overflowLabel, overflowKindLabel, prettyWorksName } from "@/lib/overflowNames";
import { sparePeople, fmtSpare } from "@/lib/capacity";

export const revalidate = 3600;

type WorksRow = {
  system_id: string; system_name: string; population: number | null; permit_dwf: number | string | null;
  demand_central: number | string | null;
  load_pct: number | null; verdict: "over" | "limit" | "within" | "not_assessed";
  diagnosis: "capacity" | "upstream" | "both" | "not_assessed" | "none"; pre_stw_count: number; upstream_count: number;
};
type MeasureRow = {
  id: string; action_ref: string | null; action_name: string | null; action_description: string | null;
  driver_code: string | null; driver_label: string | null; driver_obligation: string | null;
  cycle: string | null; completion_date: string | null; complete: boolean; source: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function generateMetadata({ params }: { params: Promise<{ assetId: string }> }): Promise<Metadata> {
  const { assetId } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spill_asset" as never, { p_asset: assetId } as never);
  const rawName = ((data ?? []) as unknown as { asset_name: string }[])[0]?.asset_name;
  const name = rawName ? overflowLabel(rawName) : null;
  return { title: name ? `${name} spills — ${INSTANCE.portalName}` : `Spill history — ${INSTANCE.portalName}` };
}

type Header = {
  asset_id: string; asset_name: string; asset_code: string | null; asset_type: string | null;
  system_id: string | null; system_name: string | null;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_updated: string | null;
  dry_all: number; total_all: number; pre_stw_all: number; first_year: number | null;
};
type YearRow = { year: number; dry: number; wet: number; total: number; hours: number };
type EventRow = { event_id: string; event_start: string; event_end: string | null; duration_minutes: number | null; weather_class: "dry" | "wet" | "unknown"; max_rain: number | null; stw_also: boolean };
type Flagged = { event_id: string; kind: "dry" | "prestw"; event_start: string; event_end: string | null; duration_minutes: number | null; max_rain: number | null };

export default async function SpillAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { assetId } = await params;
  const sp = await searchParams;
  const supabase = createPublicClient();

  const { data: hdrData } = await supabase.rpc("public_spill_asset" as never, { p_asset: assetId } as never);
  const header = ((hdrData ?? []) as unknown as Header[])[0];
  if (!header) notFound();

  const { data: yrData } = await supabase.rpc("public_spill_years" as never, { p_asset: assetId } as never);
  const years = ((yrData ?? []) as unknown as YearRow[]).sort((a, b) => a.year - b.year);
  const latestYear = years.length ? years[years.length - 1].year : new Date().getUTCFullYear();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : latestYear;
  const firstYear = header.first_year ?? (years[0]?.year ?? 2020);

  const [{ data: evData }, { data: flData }, { data: worksAll }, { data: problemData }, { data: measuresData }, { data: hbData }, { data: eoData }, { data: briefData }] = await Promise.all([
    supabase.rpc("public_spill_events" as never, { p_asset: assetId, p_year: year } as never),
    supabase.rpc("public_spill_flagged" as never, { p_asset: assetId } as never),
    supabase.rpc("public_spills_works_for_system" as never, { p_system: header.system_id } as never),
    supabase.rpc("public_spills_problem_for_asset" as never, { p_asset: assetId } as never),
    supabase.rpc("public_spills_measures_for_asset" as never, { p_asset: assetId } as never),
    supabase.rpc("public_spill_heartbeat" as never, { p_asset: assetId } as never),
    header.system_id
      ? supabase.rpc("public_eo_for_system" as never, { p_system: header.system_id } as never)
      : Promise.resolve({ data: [] }),
    supabase.rpc("public_spill_brief" as never, { p_asset: assetId, p_year: year } as never),
  ]);
  const eosAtWorks = (eoData ?? []) as unknown as EoForSystem[];
  const brief = (briefData ?? []) as unknown as { event_start: string; event_end: string | null; duration_minutes: number }[];
  const events = (evData ?? []) as unknown as EventRow[];
  const flagged = (flData ?? []) as unknown as Flagged[];
  const worksRow = ((worksAll ?? []) as unknown as WorksRow[])[0] ?? null;
  // scoped RPC returns metrics + weights only; fill in the names the header already holds
  const pr = ((problemData ?? []) as unknown as Omit<ProblemRow, "asset_name" | "asset_code" | "system_name">[])[0] ?? null;
  const problemRow: ProblemRow | null = pr
    ? { ...pr, asset_name: header.asset_name, asset_code: header.asset_code, system_name: header.system_name }
    : null;
  const measures = (measuresData ?? []) as unknown as MeasureRow[];
  const activeMeasures = measures.filter((m) => !m.complete);
  const activeImprovements = activeMeasures.filter((m) => actionTypeFromDriver(m.driver_code) === "improvement");
  const firedProblems = problemRow ? PROBLEMS.filter((p) => p.w(problemRow) > 0) : [];
  // a completed measure on a still-failing overflow is not addressing the current problem → still a gap
  const isGap = firedProblems.length > 0 && activeMeasures.length === 0;

  const nowMs = Date.now();
  // 48 hourly heartbeat ticks (oldest → newest): did a snapshot land in each of the last 48 hours?
  const hbTimes = ((hbData ?? []) as unknown as { captured_at: string }[]).map((r) => Date.parse(r.captured_at));
  const hbTicks = Array.from({ length: 48 }, (_, i) => {
    const hi = nowMs - (47 - i) * 3_600_000;
    return hbTimes.some((t) => t > hi - 3_600_000 && t <= hi);
  });
  const hbReceived = hbTicks.filter(Boolean).length;
  const d = derive({ ...(header as unknown as BoardRow), dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs);
  const yearRow = years.find((y) => y.year === year);
  const hoursYear = yearRow?.hours ?? 0;
  const dryYear = yearRow?.dry ?? 0;
  const preStwYear = events.filter((e) => !e.stw_also).length;
  const maxTotal = Math.max(1, ...years.map((y) => y.total));

  // SOAF 2025 assessment trigger: >30 spills with 1yr of data, >20 with 2, >10 with 3+
  const currentYear = new Date().getUTCFullYear();
  // The year bar spans every year from the asset's first record to the current year, so a recent year
  // with no reportable spills (e.g. only sub-15-minute events, which the site excludes everywhere)
  // still appears as an empty bar and can be opened — rather than silently vanishing from the asset.
  const yearByNum = new Map(years.map((y) => [y.year, y]));
  const barYears: YearRow[] = [];
  for (let yy = firstYear; yy <= Math.max(latestYear, currentYear); yy++) {
    barYears.push(yearByNum.get(yy) ?? { year: yy, dry: 0, wet: 0, total: 0, hours: 0 });
  }
  const fullYears = years.filter((y) => y.year < currentYear);
  const latestFull = fullYears.length ? fullYears[fullYears.length - 1] : null;
  const soafThreshold = years.length >= 3 ? 10 : years.length === 2 ? 20 : 30;
  const soafCrossed = latestFull ? latestFull.total > soafThreshold : false;

  // "Why this one spills" — an adaptive verdict, shown only when a problem is flagged
  const worksHasHeadroom = worksRow ? (worksRow.verdict === "within" || worksRow.verdict === "not_assessed") : true;
  // Pick the dominant problem by weight; on a tie, lead with the more pointed regulatory framing —
  // dry-weather spills and pre-works spills over raw volume (frequency/hours).
  const WHY_PRIORITY: Record<string, number> = { dry: 0, prestw: 1, freq: 2, long: 3, feed: 4 };
  const topProblem = firedProblems.slice().sort(
    (a, b) => b.w(problemRow!) - a.w(problemRow!) || WHY_PRIORITY[a.key] - WHY_PRIORITY[b.key],
  )[0];
  const whySpills = !topProblem ? null
    : topProblem.key === "dry" ? {
        headline: "This looks like a fault, not a storm.",
        body: `This overflow has discharged in dry weather ${header.dry_all} time${header.dry_all === 1 ? "" : "s"} since 2020 — spills with no rainfall to excuse them.${worksHasHeadroom ? " Its treatment works is not itself over capacity, so a catchment-wide explanation does not hold." : ""} Applied to this record, the two-stage lawfulness test is hard to pass: a recurring dry-weather discharge is not an exceptional circumstance, and where the remedy is routine maintenance the disproportionate-cost exception is hard to run.`,
      }
    : topProblem.key === "prestw" ? {
        headline: "The problem here is local, not the works.",
        body: `This overflow spilled ${header.pre_stw_all} time${header.pre_stw_all === 1 ? "" : "s"} on days its own treatment works stayed shut — so the works still had capacity. That points upstream, to this branch of the network, rather than to a works too small for its catchment.`,
      }
    : {
        headline: "This overflow spills far more than most.",
        body: `On the analysis this is one of the catchment's heavier or longer-running overflows.${worksHasHeadroom ? " Its treatment works is not recorded as over capacity, so the volume is worth explaining." : ""} See the record below, and how the verdict is reached.`,
      };

  const permitDwf = worksRow && worksRow.permit_dwf != null ? Number(worksRow.permit_dwf) : null;

  // spills by month for the selected year (elapsed months only)
  const monthly = Array.from({ length: 12 }, () => ({ dry: 0, wet: 0, total: 0 }));
  let lastMonth = -1;
  for (const e of events) {
    const m = new Date(e.event_start).getUTCMonth();
    monthly[m].total++;
    if (e.weather_class === "dry") monthly[m].dry++;
    else if (e.weather_class === "wet") monthly[m].wet++;
    if (m > lastMonth) lastMonth = m;
  }
  const monthsShown = lastMonth >= 0 ? monthly.slice(0, lastMonth + 1) : [];
  const maxMonth = Math.max(1, ...monthsShown.map((m) => m.total));

  const verdict =
    d.status === "spilling" ? `Spilling now — ${fmtDuration(d.spillMinutes)}`
    : d.status === "recent" ? `Not spilling — but it stopped ${fmtAge(d.stoppedMinutes)} ago`
    : d.status === "nodata" ? "Unknown — this monitor has gone quiet"
    : "Not spilling";
  const verdictNote =
    d.status === "spilling" ? "This overflow is discharging now. Avoid the water downstream."
    : d.status === "recent" ? "Bacteria levels can stay raised for 24–48 hours after a spill ends."
    : d.status === "nodata" ? "We have had no readings recently. Nothing here should be read as an all-clear."
    : "The monitor is reporting and shows no discharge.";

  const dryRows = flagged.filter((f) => f.kind === "dry");
  const preRows = flagged.filter((f) => f.kind === "prestw");

  return (
    <div className="space-y-6 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>

      {/* title */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink"><OverflowName raw={header.asset_name} type={header.asset_type} chip={false} /></h1>
          <div className="font-plexmono text-[12.5px] text-rh-ink3">{header.asset_code ?? "—"}</div>
          <div className="mt-1 text-[13.5px] text-rh-ink2">
            Overflow on the network feeding <strong>{header.system_name ? prettyWorksName(header.system_name) : "its works"}</strong> · {overflowKindLabel(header.asset_name, header.asset_type)}
          </div>
          <div className="text-[12.5px] text-rh-ink3">Showing history for {year} · records go back to {firstYear}</div>
        </div>
        <WatchlistButton assetId={assetId} />
      </div>

      {/* status hero */}
      <div className={`rounded-[3px] border px-[26px] py-6 ${d.status === "spilling" ? "border-[#e8b6ae] bg-rh-alarmTint" : "border-rh-line bg-rh-card"}`}>
        <div className="flex items-start gap-3">
          <StatusDot status={d.status} size={14} live={d.status === "spilling"} />
          <div className="flex-1">
            <div className="text-[27px] font-bold text-rh-ink">{verdict}</div>
            <p className="mt-1 max-w-[560px] text-[14px] text-[#46555a]">{verdictNote}</p>
          </div>
          <div className="flex gap-8">
            <HeroStat label={d.status === "spilling" ? "Spill started" : "Last spill ended"} value={fmtWhen(d.status === "spilling" ? (header.status_start ?? header.latest_event_start) : header.latest_event_end)} />
            <HeroStat label={`Hours spilled, ${year}`} value={hoursYear.toLocaleString()} />
          </div>
        </div>
      </div>

      {/* three answer cards */}
      <div className="flex flex-wrap gap-3">
        <AnswerCard accent="teal" flexBasis="1 1 320px" title={
          <span className="flex items-center gap-2">
            <StatusDot status={d.feed === "reporting" ? "ok" : d.feed === "quiet" ? "recent" : "nodata"} live={d.feed === "reporting"} />
            {d.feed === "reporting" ? "Working" : d.feed === "quiet" ? "Late" : "Not reporting"}
          </span>
        } label="Is the feed working?" note={
          <>
            {header.last_updated ? `Last checked ${fmtAge(d.feedAgeMin)} ago · we poll SWW hourly` : "No readings received yet"}
            <Heartbeat ticks={hbTicks} />
            <span className="mt-1 block font-plexmono text-[10.5px] text-rh-ink3">{hbReceived}/48 hourly readings received</span>
          </>
        } />
        <AnswerCard accent="dry" flexBasis="1 1 240px" title={<span className="font-plexmono text-[30px] leading-none text-rh-dry">{dryYear}</span>} label={`Dry spills, ${year}`}
          note={dryYear === 0 ? `None in ${year} · ${header.dry_all} since 2020` : `${dryYear} in ${year} · ${header.dry_all} since 2020`} link={{ href: "/explore/spills/method", text: "How a dry spill is decided →" }} />
        <AnswerCard accent="prestw" flexBasis="1 1 240px" title={<span className="font-plexmono text-[30px] leading-none text-rh-prestw">{preStwYear}</span>} label={`Spilled before its STW, ${year}`}
          note={`${preStwYear} in ${year} · ${header.pre_stw_all} since 2020`} link={{ href: "/explore/spills/method", text: "What this means →" }} />
      </div>

      {/* why this one spills */}
      {whySpills && (
        <div className="rounded-[3px] border-l-[4px] px-[26px] py-6" style={{ background: "#f5f0fa", borderColor: "#d3c3e4", borderLeftColor: "#6b4a8f" }}>
          <div className="font-plexmono text-[11px] font-semibold uppercase tracking-[.08em] text-rh-dryDeep">Why this one spills</div>
          <p className="mt-2 max-w-[720px] text-[19px] font-bold leading-[1.35] text-rh-ink">{whySpills.headline}</p>
          <p className="mt-2 max-w-[720px] text-[13.5px] leading-[1.55] text-rh-ink2">{whySpills.body}</p>
          <Link href="/explore/spills/method" className="mt-3 inline-block text-[12.5px] font-semibold text-rh-teal hover:underline">How this verdict is reached →</Link>
        </div>
      )}

      {/* can its works cope? */}
      {worksRow && <WorksCopeCard works={worksRow} />}

      {/* emergency overflows on the same works — a class of discharge absent from this page's feed */}
      {eosAtWorks.length > 0 && <EoAtWorksPanel eos={eosAtWorks} systemName={header.system_name} />}

      {/* its permit */}
      <PermitPanel permitDwf={permitDwf} soafCrossed={soafCrossed} soafThreshold={soafThreshold} />

      {/* is anyone acting on this? */}
      {(firedProblems.length > 0 || measures.length > 0) && (
        <ActingCard firedProblems={firedProblems} problemRow={problemRow} measures={measures} activeMeasures={activeMeasures} activeImprovements={activeImprovements} />
      )}

      {/* what you can do about this one */}
      <WhatYouCanDo assetName={overflowLabel(header.asset_name, header.asset_type)} />

      {/* since 2020 */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="text-[17px] font-bold text-rh-ink">The record since 2020</h2>
        <p className="mt-1 text-[12.5px] text-rh-ink3">{header.dry_all} dry spills and {header.pre_stw_all} pre-STW spills since 2020. Pick a year to see its events below.</p>
        <div className="mt-4 flex items-end gap-2.5" style={{ height: 150 }}>
          {barYears.map((y) => {
            const h = (y.total / maxTotal) * 118;
            return (
              <Link key={y.year} href={`?year=${y.year}`} scroll={false} className="flex flex-1 flex-col items-center justify-end gap-1 text-center">
                <span className="font-plexmono text-[11px] text-rh-ink3">{y.total}</span>
                <span className="flex w-full max-w-[42px] flex-col justify-end overflow-hidden rounded-t-[2px]" style={{ height: Math.max(4, h) }}>
                  <span className="w-full bg-rh-dry" style={{ height: `${(y.dry / Math.max(1, y.total)) * 100}%` }} />
                  <span className="w-full bg-rh-wet" style={{ height: `${(y.wet / Math.max(1, y.total)) * 100}%` }} />
                </span>
                <span className={`mt-1 rounded px-1.5 text-[11px] ${y.year === year ? "bg-rh-well font-bold text-rh-ink" : "text-[#7a8788]"}`}>{y.year}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* flagged tables */}
      <div className="flex flex-wrap gap-3">
        <FlaggedTable title="Dry spills, every year" accent="border-t-rh-dry" subline={`${dryRows.length} dry spills since 2020 · showing up to 12`} rows={dryRows.slice(0, 12)} assetId={assetId} rainClass="text-rh-dryDeep" worksLabel="Not spilling" empty="No dry spills on record for this overflow since 2020." />
        <FlaggedTable title="Spilled before its works" accent="border-t-rh-prestw" subline={`${preRows.length} events since 2020 · started while ${header.system_name ? prettyWorksName(header.system_name) : "its works"} stayed shut`} rows={preRows.slice(0, 12)} assetId={assetId} rainClass="text-rh-ink3" worksLabel="Stayed shut" empty="This overflow has never been recorded spilling ahead of its treatment works." />
      </div>

      {/* spills by month */}
      {monthsShown.length > 0 && (
        <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-bold text-rh-ink">Spills by month{year === latestYear ? ` — ${year} to date` : `, ${year}`}</h2>
            <span className="flex items-center gap-3 text-[11.5px] text-rh-ink3">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-rh-dry" /> Dry</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-rh-wet" /> Wet weather</span>
            </span>
          </div>
          <div className="mt-4 flex items-end gap-2" style={{ height: 150 }}>
            {monthsShown.map((m, i) => {
              const h = (m.total / maxMonth) * 118;
              return (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="font-plexmono text-[11px] text-rh-ink3">{m.total || ""}</span>
                  <span className="flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-t-[2px]" style={{ height: Math.max(2, h) }}>
                    <span className="w-full bg-rh-dry" style={{ height: `${(m.dry / Math.max(1, m.total)) * 100}%` }} />
                    <span className="w-full bg-rh-wet" style={{ height: `${(m.wet / Math.max(1, m.total)) * 100}%` }} />
                  </span>
                  <span className="text-[10.5px] text-[#7a8788]">{MONTHS[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* event log */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card">
        <div className="border-b border-rh-lineSoft px-[22px] py-3">
          <h2 className="text-[16px] font-bold text-rh-ink">
            {events.length > 0 ? `Every spill in ${year}, most recent first` : `No spills over 15 minutes in ${year}`}
          </h2>
          <p className="text-[12px] text-rh-ink3">
            {events.length > 0
              ? "Each event checked against the nearest rain gauge and against the treatment works’ own overflow. Open any row for its evidence dossier."
              : brief.length > 0
                ? <>Nothing over 15 minutes in {year}{year === currentYear ? " so far" : ""} — its only activity was the {brief.length === 1 ? "brief spill" : `${brief.length} brief spills`} under 15 minutes, listed below.</>
                : <>Nothing over 15 minutes was recorded at this overflow in {year}{year === currentYear ? " so far" : ""}. Discharges shorter than 15 minutes are excluded everywhere on this site — a brief operational blip is not counted as a spill. <Link href="/explore/spills/method" className="text-rh-teal hover:underline">How we know</Link>.</>}
          </p>
        </div>
        {events.length > 0 && (
          <div className="hidden gap-3 bg-rh-cardAlt px-[22px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label sm:flex">
            <div className="flex-[0_0_130px]">Started</div><div className="flex-[0_0_90px]">Duration</div>
            <div className="flex-[0_0_120px]">Rain 24h before</div><div className="flex-[0_0_130px]">Classification</div><div className="flex-[1_1_160px]">STW overflow</div><div className="flex-[0_0_22px]"></div>
          </div>
        )}
        {events.slice(0, 80).map((e, i) => (
          <Link key={i} href={`/explore/spills/${assetId}/events/${e.event_id}`} className="group flex flex-col gap-1 border-b border-rh-rowDiv px-[22px] py-3 text-[12.5px] hover:bg-rh-rowHover sm:flex-row sm:items-center sm:gap-3">
            <div className="flex-[0_0_130px] font-plexmono text-rh-ink">{fmtWhen(e.event_start)}</div>
            <div className="flex-[0_0_90px] font-plexmono text-rh-ink2">{fmtDuration(e.duration_minutes)}</div>
            <div className="flex-[0_0_120px] font-plexmono text-rh-ink2">{e.max_rain != null ? `${e.max_rain.toFixed(1)} mm` : "—"}</div>
            <div className="flex-[0_0_130px]">{e.weather_class === "dry" ? <Chip variant="dry">Dry spill</Chip> : e.weather_class === "wet" ? <Chip variant="wet">Wet weather</Chip> : <Chip variant="quiet">No rain data</Chip>}</div>
            <div className={`flex-[1_1_160px] ${!e.stw_also ? "text-rh-prestw" : "text-rh-ink2"}`}>{e.stw_also ? "Also spilling" : "Not spilling — flagged before STW"}</div>
            <div className="flex-[0_0_22px] text-rh-ink3 group-hover:text-rh-teal">→</div>
          </Link>
        ))}
        {events.length > 80 && <p className="px-[22px] py-3 text-[12px] text-rh-ink3">Showing the last 80 events of {events.length} in {year}.</p>}

        {/* brief spills — sub-15-minute discharges, excluded from every count above but shown for completeness */}
        {brief.length > 0 && (
          <div className="border-t border-rh-lineSoft bg-rh-cardAlt px-[22px] py-3.5">
            <div className="text-[12.5px] font-semibold text-rh-ink">
              {brief.length} brief spill{brief.length === 1 ? "" : "s"} under 15 minutes in {year}
            </div>
            <p className="mt-0.5 max-w-[720px] text-[11.5px] leading-[1.5] text-rh-ink3">
              Excluded from the counts, classification and flags above — too short to weigh against rainfall, and often an operational blip rather than a genuine discharge. Listed here for completeness. <Link href="/explore/spills/method" className="text-rh-teal hover:underline">How we know</Link>.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-plexmono text-[11.5px] text-rh-ink2">
              {brief.slice(0, 40).map((e, i) => (
                <span key={i} className="whitespace-nowrap">{fmtWhen(e.event_start)} · {fmtDuration(e.duration_minutes)}</span>
              ))}
              {brief.length > 40 && <span className="text-rh-ink3">+{brief.length - 40} more</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Heartbeat({ ticks }: { ticks: boolean[] }) {
  return (
    <div className="mt-2" aria-label="Feed heartbeat over the last 48 hours">
      <div className="flex items-end gap-[1.5px]" style={{ height: 24 }}>
        {ticks.map((on, i) => (
          <span key={i} className="flex-1 rounded-[1px]" style={{ height: on ? 22 : 10, backgroundColor: on ? "#0d6b62" : "#dcd8ce" }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-plexmono text-[9.5px] text-rh-ink3"><span>48h ago</span><span>now</span></div>
    </div>
  );
}

function PermitPanel({ permitDwf, soafCrossed, soafThreshold }: { permitDwf: number | null; soafCrossed: boolean; soafThreshold: number }) {
  const rows: { k: string; v: React.ReactNode; alarm?: boolean }[] = [
    { k: "Pass-forward flow", v: permitDwf != null ? `${permitDwf.toLocaleString()} m³/day (works DWF)` : <span className="text-rh-ink3">Not published</span> },
    { k: "Spill frequency limit", v: <span className="text-rh-ink3">None set</span> },
    { k: "Monitoring tier", v: <span className="text-rh-ink3">Not published</span> },
    {
      k: "Assessment trigger",
      v: soafCrossed ? `Crossed — over ${soafThreshold} spills/year` : `Not crossed (threshold ${soafThreshold}/year)`,
      alarm: soafCrossed,
    },
  ];
  return (
    <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
      <h2 className="text-[17px] font-bold text-rh-ink">Its permit</h2>
      <p className="mt-1 text-[12.5px] text-rh-ink3">What the environmental permit sets for this overflow — and where the public record is silent, which is itself the finding.</p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-3 border-b border-rh-rowDiv pb-2">
            <dt className="text-[12.5px] text-rh-label">{r.k}</dt>
            <dd className={`text-right text-[13px] ${r.alarm ? "font-semibold text-rh-alarm" : "text-rh-ink"}`}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WhatYouCanDo({ assetName }: { assetName: string }) {
  const steps = [
    { when: "OPEN NOW", title: "Ask for the data", body: `Under the Environmental Information Regulations, ${assetName}'s telemetry, the works' flow-to-full-treatment setting, and any spill investigations are emissions information — they cannot be withheld on commercial-confidentiality grounds. A written request is the fastest lever.` },
    { when: "BY 30 APR 2027", title: "Get it into the next programme", body: "Investigations that will shape the 2030–35 environment programme must complete by this date. Putting this overflow on the record now — to South West Water and the Environment Agency — is what gets it considered." },
    { when: "BY 1 NOV 2027", title: "Put it in the drainage plan", body: "South West Water's draft Drainage & Wastewater Management Plan goes to a twelve-week consultation. A named overflow with evidence behind it is far harder to leave out." },
  ];
  return (
    <div>
      <h2 className="mb-3 text-[17px] font-bold text-rh-ink">What you can do about this one</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.when} className="rounded-[3px] border border-rh-line border-l-[3px] border-l-rh-teal bg-rh-card px-[18px] py-4">
            <div className="font-plexmono text-[11px] font-semibold uppercase tracking-[.08em] text-rh-label">{s.when}</div>
            <h3 className="mt-1 text-[14px] font-bold text-rh-ink">{s.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-rh-ink2">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EoAtWorksPanel({ eos, systemName }: { eos: EoForSystem[]; systemName: string | null }) {
  const active = eos.filter((e) => (e.total_hours ?? 0) > 0);
  const totalHours = eos.reduce((s, e) => s + (e.total_hours ?? 0), 0);
  const worksLabel = systemName ? `${prettyWorksName(systemName)} works` : "this works";
  return (
    <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#6b4a8f] bg-rh-card px-[22px] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold text-rh-ink">The same works has emergency overflows too</h2>
        <Link href="/explore/spills/emergency-overflows" className="text-[12.5px] font-semibold text-rh-teal hover:underline">All emergency overflows →</Link>
      </div>
      <p className="mt-1 max-w-[640px] text-[12.5px] text-rh-ink2">
        {eos.length} pumping-station emergency overflow{eos.length === 1 ? "" : "s"} feed{eos.length === 1 ? "s" : ""} {worksLabel} —
        raw-sewage relief outlets that should fire only when a pump fails. They are not in this page&apos;s feed;
        {active.length > 0 ? ` between them they have discharged about ${fmtHours(totalHours)} recorded hours.` : " none has a recorded discharge."}
      </p>
      {active.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {active.sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0)).map((e) => (
            <div key={e.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-rh-rowDiv pt-1.5 first:border-0 first:pt-0 text-[12.5px]">
              <span className="font-semibold text-rh-ink">{eoDisplayName(e.overflow_name)}</span>
              <span className="font-plexmono text-rh-ink2">{fmtHours(e.total_hours)}h total</span>
              {e.worst_hours != null && e.worst_hours > 0 && <span className="text-rh-ink3">worst year {fmtHours(e.worst_hours)}h</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorksCopeCard({ works }: { works: WorksRow }) {
  const permit = works.permit_dwf == null ? null : Number(works.permit_dwf);
  const v = works.verdict;
  const topColor = v === "over" ? "#b8342a" : v === "limit" ? "#c07a12" : v === "within" ? "#0d6b62" : "#7d8a8c";
  const verdictLabel = v === "over" ? "Over capacity" : v === "limit" ? "At the limit" : v === "within" ? "Within capacity" : "Not assessed";
  const diag = works.diagnosis === "capacity" ? "The works itself needs investment or a lower permit."
    : works.diagnosis === "upstream" ? "The works has headroom — so spills here point to another problem, often on that branch of the network (a blockage, a failed pump or infiltration)."
    : works.diagnosis === "both" ? "Both a works-capacity problem and faults on the network."
    : works.diagnosis === "not_assessed" ? "We cannot check the works — its permitted flow or population served is missing from the public record."
    : "No capacity signal in the record.";
  const fillPct = works.load_pct == null ? 0 : Math.min(works.load_pct, 130) / 130 * 100;

  return (
    <div className="rounded-[3px] border border-rh-line border-t-[3px] bg-rh-card px-[22px] py-5" style={{ borderTopColor: topColor }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold text-rh-ink">Can its works cope?</h2>
        <Link href="/explore/spills/why/capacity" className="text-[12.5px] font-semibold text-rh-teal hover:underline">Full capacity view →</Link>
      </div>
      <p className="mt-1 text-[12.5px] text-rh-ink3">
        This overflow drains to <strong>{prettyWorksName(works.system_name)}</strong>{works.population != null && works.population > 0 ? `, serving about ${works.population.toLocaleString()} people` : ""}{permit != null ? ` on a ${permit.toLocaleString()} m³/day permit` : ""}.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex-[0_0_auto]">
          <div className="font-plexmono text-[27px] font-bold leading-none" style={{ color: topColor }}>
            {works.load_pct != null ? `${works.load_pct}%` : "—"}
          </div>
          <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">of permitted flow</div>
        </div>
        <div className="flex-[1_1_220px]">
          {works.load_pct != null ? (
            <div className="relative h-2 rounded-[2px] bg-rh-lineSoft">
              <div className="h-full rounded-[2px]" style={{ width: `${fillPct}%`, backgroundColor: topColor }} />
              <div className="absolute top-[-1px] bottom-[-1px] w-px bg-rh-ink" style={{ left: "76.9%" }} />
            </div>
          ) : (
            <div className="h-2 rounded-[2px] border border-dashed border-[#c9c3b5]" />
          )}
          <div className="mt-2 inline-flex rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold"
            style={{ color: topColor, borderColor: topColor + "55", backgroundColor: topColor + "12" }}>{verdictLabel}</div>
        </div>
      </div>
      <p className="mt-3 max-w-[620px] text-[12.5px] text-rh-ink2">{diag}</p>
      {(() => {
        const spare = sparePeople(works.permit_dwf, works.demand_central, works.population);
        return spare != null && spare > 0 ? (
          <p className="mt-2 max-w-[620px] text-[12.5px] text-rh-ink2">
            On our estimate the works has spare capacity for about <strong className="text-rh-teal">{fmtSpare(spare)} more people</strong> before it reaches its permitted flow.
          </p>
        ) : null;
      })()}
    </div>
  );
}

function ActingCard({ firedProblems, problemRow, measures, activeMeasures, activeImprovements }: {
  firedProblems: typeof PROBLEMS[number][]; problemRow: ProblemRow | null;
  measures: MeasureRow[]; activeMeasures: MeasureRow[]; activeImprovements: MeasureRow[];
}) {
  const flagged = firedProblems.length > 0;
  // improvement under way > investigation/monitoring under way > gap (completed-only or none) > no problem
  const verdict =
    activeImprovements.length > 0 ? { text: "Improvement under way", color: "#0d6b62", note: "A physical improvement is committed against this overflow." }
    : activeMeasures.length > 0 ? { text: "Under investigation", color: "#c07a12", note: "An investigation or monitoring measure is active — a step towards a fix, not a fix in itself. It must lead to an improvement before anything changes." }
    : flagged && measures.length > 0 ? { text: "Past measure, still failing", color: "#b8342a", note: "The only measures on record are already complete, yet the overflow is still flagged — so further action is needed. That is a gap." }
    : flagged ? { text: "No action recorded", color: "#b8342a", note: "A flagged problem with no active measure against it. That is a gap in the public record." }
    : { text: "No problem flagged", color: "#7d8a8c", note: "The analysis flags no material problem here." };
  const topColor = verdict.color;
  return (
    <div className="rounded-[3px] border border-rh-line border-t-[3px] bg-rh-card" style={{ borderTopColor: topColor }}>
      <div className="border-b border-rh-lineSoft px-[22px] py-3">
        <h2 className="text-[17px] font-bold text-rh-ink">Is anyone acting on this?</h2>
      </div>
      <div className="grid grid-cols-1 gap-px bg-rh-lineSoft sm:grid-cols-3">
        <div className="bg-rh-card px-[18px] py-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">Flagged problems</div>
          {firedProblems.length > 0 && problemRow ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {firedProblems.map((p) => (
                <span key={p.key}>
                  <span className="inline-flex items-center whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: p.color, borderColor: p.color + "55", backgroundColor: p.color + "12" }}>{p.label}</span>
                  <span className="ml-2 text-[11.5px] text-rh-ink3">{p.ev(problemRow)}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-rh-ink3">Nothing flagged by the analysis.</p>
          )}
        </div>
        <div className="bg-rh-card px-[18px] py-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">Measures on record</div>
          {measures.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {measures.map((m) => {
                const tk = actionTypeFromDriver(m.driver_code);
                const t = ACTION_TYPE_META[tk];
                const yr = m.completion_date ? new Date(m.completion_date).getUTCFullYear() : null;
                return (
                  <li key={m.id} className="text-[12.5px]">
                    <div className="font-semibold text-rh-ink">{measureRequirement(m.action_description, tk)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-rh-ink3">
                      <span className={`inline-flex rounded-[2px] border px-1.5 py-0 text-[10.5px] font-semibold ${t.className}`}>{t.label}</span>
                      {yr != null && <span>{m.complete ? `complete ${yr}` : `due ${yr}`}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-rh-ink3">Nothing on record.</p>
          )}
        </div>
        <div className="bg-rh-card px-[18px] py-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">Verdict</div>
          <div className="mt-2 inline-flex rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold"
            style={{ color: topColor, borderColor: topColor + "55", backgroundColor: topColor + "12" }}>{verdict.text}</div>
          <p className="mt-2 text-[11.5px] text-rh-ink3">{verdict.note}</p>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">{label}</div>
      <div className="mt-0.5 font-plexmono text-[16px] font-semibold text-rh-ink">{value}</div>
    </div>
  );
}

function AnswerCard({ accent, flexBasis, title, label, note, link }: { accent: "teal" | "dry" | "prestw"; flexBasis: string; title: React.ReactNode; label?: string; note: React.ReactNode; link?: { href: string; text: string } }) {
  const bar = accent === "teal" ? "border-t-rh-teal" : accent === "dry" ? "border-t-rh-dry" : "border-t-rh-prestw";
  return (
    <div className={`rounded-[3px] border border-rh-line border-t-[3px] ${bar} bg-rh-card px-5 py-4`} style={{ flex: flexBasis }}>
      {label && <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">{label}</div>}
      <div className="text-[19px] font-bold text-rh-ink">{title}</div>
      <div className="mt-2 text-[12.5px] text-rh-ink2">{note}</div>
      {link && <Link href={link.href} className="mt-2 inline-block text-[12.5px] font-semibold text-rh-teal hover:underline">{link.text}</Link>}
    </div>
  );
}

function FlaggedTable({ title, accent, subline, rows, assetId, rainClass, worksLabel, empty }: { title: string; accent: string; subline: string; rows: Flagged[]; assetId: string; rainClass: string; worksLabel: string; empty: string }) {
  return (
    <div className={`flex-[1_1_380px] rounded-[3px] border border-rh-line border-t-[3px] ${accent} bg-rh-card`}>
      <div className="border-b border-rh-lineSoft px-[18px] py-3">
        <h3 className="text-[16px] font-bold text-rh-ink">{title}</h3>
        <p className="text-[11.5px] text-rh-ink3">{subline}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-[18px] py-6 text-[12.5px] text-rh-ink3">{empty}</p>
      ) : (
        <>
          <div className="hidden gap-3 bg-rh-cardAlt px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label sm:flex">
            <div className="flex-[1_1_104px]">Started</div><div className="flex-[0_0_74px]">Length</div><div className="flex-[0_0_66px]">Rain 24h</div><div className="flex-[0_0_82px]">Its works</div><div className="flex-[0_0_22px]"></div>
          </div>
          {rows.map((r, i) => (
            <Link key={i} href={`/explore/spills/${assetId}/events/${r.event_id}`} className="group flex flex-col gap-1 border-b border-rh-rowDiv px-[18px] py-2.5 text-[12.5px] hover:bg-rh-rowHover sm:flex-row sm:items-center sm:gap-3">
              <div className="flex-[1_1_104px] font-plexmono text-rh-ink">{fmtWhen(r.event_start)}</div>
              <div className="flex-[0_0_74px] font-plexmono text-rh-ink2">{fmtDuration(r.duration_minutes)}</div>
              <div className={`flex-[0_0_66px] font-plexmono font-semibold ${rainClass}`}>{r.max_rain != null ? `${r.max_rain.toFixed(1)}` : "—"}</div>
              <div className="flex-[0_0_82px] font-semibold text-rh-prestw">{worksLabel}</div>
              <div className="flex-[0_0_22px] text-rh-ink3 group-hover:text-rh-teal">→</div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
