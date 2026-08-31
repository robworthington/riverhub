import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { MixBar } from "@/components/public/MixBar";
import { Chip } from "@/components/public/Chip";
import { StatusDot } from "@/components/public/StatusDot";
import { WatchlistButton } from "@/components/public/WatchlistButton";
import { derive, fmtDuration, fmtAge, fmtWhen, overflowKind, type BoardRow } from "@/lib/spillStatus";
import { PROBLEMS, type ProblemRow } from "@/lib/spillProblems";

export const revalidate = 3600;

type WorksRow = {
  system_id: string; system_name: string; population: number | null; permit_dwf: number | string | null;
  load_pct: number | null; verdict: "over" | "limit" | "within" | "not_assessed";
  diagnosis: "capacity" | "upstream" | "both" | "not_assessed" | "none"; pre_stw_count: number; upstream_count: number;
};
type MeasureRow = {
  id: string; action_ref: string | null; action_name: string | null; driver_label: string | null;
  driver_obligation: string | null; cycle: string | null; completion_date: string | null; overdue: boolean; source: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function generateMetadata({ params }: { params: Promise<{ assetId: string }> }): Promise<Metadata> {
  const { assetId } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spill_asset" as never, { p_asset: assetId } as never);
  const name = ((data ?? []) as unknown as { asset_name: string }[])[0]?.asset_name;
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

  const [{ data: evData }, { data: flData }, { data: worksAll }, { data: problemsAll }, { data: measuresData }, { data: hbData }] = await Promise.all([
    supabase.rpc("public_spill_events" as never, { p_asset: assetId, p_year: year } as never),
    supabase.rpc("public_spill_flagged" as never, { p_asset: assetId } as never),
    supabase.rpc("public_spills_works" as never, {} as never),
    supabase.rpc("public_spills_problems" as never, {} as never),
    supabase.rpc("public_spills_measures_for_asset" as never, { p_asset: assetId } as never),
    supabase.rpc("public_spill_heartbeat" as never, { p_asset: assetId } as never),
  ]);
  const events = (evData ?? []) as unknown as EventRow[];
  const flagged = (flData ?? []) as unknown as Flagged[];
  const worksRow = ((worksAll ?? []) as unknown as WorksRow[]).find((w) => w.system_id === header.system_id) ?? null;
  const problemRow = ((problemsAll ?? []) as unknown as ProblemRow[]).find((p) => p.asset_id === assetId) ?? null;
  const measures = (measuresData ?? []) as unknown as MeasureRow[];
  const firedProblems = problemRow ? PROBLEMS.filter((p) => p.w(problemRow) > 0) : [];
  const isGap = firedProblems.length > 0 && measures.length === 0;

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
          <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">{header.asset_name}</h1>
          <div className="font-plexmono text-[12.5px] text-rh-ink3">{header.asset_code ?? "—"}</div>
          <div className="mt-1 text-[13.5px] text-rh-ink2">
            Overflow on the network feeding <strong>{header.system_name ?? "its works"}</strong> · {overflowKind(header.asset_code, header.asset_type)}
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

      {/* can its works cope? */}
      {worksRow && <WorksCopeCard works={worksRow} />}

      {/* is anyone acting on this? */}
      {(firedProblems.length > 0 || measures.length > 0) && (
        <ActingCard firedProblems={firedProblems} problemRow={problemRow} measures={measures} isGap={isGap} />
      )}

      {/* since 2020 */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="text-[17px] font-bold text-rh-ink">The record since 2020</h2>
        <p className="mt-1 text-[12.5px] text-rh-ink3">{header.dry_all} dry spills and {header.pre_stw_all} pre-STW spills since 2020. Pick a year to see its events below.</p>
        <div className="mt-4 flex items-end gap-2.5" style={{ height: 150 }}>
          {years.map((y) => {
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
        <FlaggedTable title="Spilled before its works" accent="border-t-rh-prestw" subline={`${preRows.length} events since 2020 · started while ${header.system_name ?? "its works"} stayed shut`} rows={preRows.slice(0, 12)} assetId={assetId} rainClass="text-rh-ink3" worksLabel="Stayed shut" empty="This overflow has never been recorded spilling ahead of its treatment works." />
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
          <h2 className="text-[16px] font-bold text-rh-ink">Every spill in {year}, most recent first</h2>
          <p className="text-[12px] text-rh-ink3">Each event checked against the nearest rain gauge and against the treatment works&apos; own overflow. Open any row for its evidence dossier.</p>
        </div>
        <div className="hidden gap-3 bg-rh-cardAlt px-[22px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label sm:flex">
          <div className="flex-[0_0_130px]">Started</div><div className="flex-[0_0_90px]">Duration</div>
          <div className="flex-[0_0_120px]">Rain 24h before</div><div className="flex-[0_0_130px]">Classification</div><div className="flex-[1_1_160px]">STW overflow</div><div className="flex-[0_0_22px]"></div>
        </div>
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
        {events.length === 0 && <p className="px-[22px] py-6 text-center text-[13px] text-rh-ink3">No spills recorded in {year}.</p>}
        {events.length > 80 && <p className="px-[22px] py-3 text-[12px] text-rh-ink3">Showing the last 80 events of {events.length} in {year}.</p>}
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

function WorksCopeCard({ works }: { works: WorksRow }) {
  const permit = works.permit_dwf == null ? null : Number(works.permit_dwf);
  const v = works.verdict;
  const topColor = v === "over" ? "#b8342a" : v === "limit" ? "#c07a12" : v === "within" ? "#0d6b62" : "#7d8a8c";
  const verdictLabel = v === "over" ? "Over capacity" : v === "limit" ? "At the limit" : v === "within" ? "Within capacity" : "Not assessed";
  const diag = works.diagnosis === "capacity" ? "The works itself needs investment or a lower permit."
    : works.diagnosis === "upstream" ? "The works has headroom — spills here point upstream, to a blockage, failed pump or infiltration."
    : works.diagnosis === "both" ? "Both a works-capacity problem and upstream faults."
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
        This overflow drains to <strong>{works.system_name}</strong>{works.population != null && works.population > 0 ? `, serving about ${works.population.toLocaleString()} people` : ""}{permit != null ? ` on a ${permit.toLocaleString()} m³/day permit` : ""}.
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
    </div>
  );
}

function ActingCard({ firedProblems, problemRow, measures, isGap }: {
  firedProblems: typeof PROBLEMS[number][]; problemRow: ProblemRow | null; measures: MeasureRow[]; isGap: boolean;
}) {
  const topColor = isGap ? "#b8342a" : measures.length > 0 ? "#0d6b62" : "#7d8a8c";
  const verdict = isGap ? "No action recorded" : measures.length > 0 ? "Action under way" : "No problem flagged";
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
              {measures.map((m) => (
                <li key={m.id} className="text-[12.5px]">
                  <div className="font-semibold text-rh-ink">{m.action_name ?? m.driver_label ?? "Measure"}</div>
                  <div className="text-[11.5px] text-rh-ink3">
                    {m.cycle ?? ""}{m.action_ref ? ` · ${m.action_ref}` : ""}
                    {m.completion_date ? ` · ${m.overdue ? "overdue" : "due"} ${new Date(m.completion_date).getUTCFullYear()}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-rh-ink3">Nothing on record.</p>
          )}
        </div>
        <div className="bg-rh-card px-[18px] py-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">Verdict</div>
          <div className="mt-2 inline-flex rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold"
            style={{ color: topColor, borderColor: topColor + "55", backgroundColor: topColor + "12" }}>{verdict}</div>
          <p className="mt-2 text-[11.5px] text-rh-ink3">
            {isGap ? "A flagged problem with no measure linked to it. That is a gap in the public record." : measures.length > 0 ? "A recorded measure addresses this overflow." : "The analysis flags no material problem here."}
          </p>
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
