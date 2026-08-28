import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { MixBar } from "@/components/public/MixBar";
import { Chip } from "@/components/public/Chip";
import { StatusDot } from "@/components/public/StatusDot";
import { WatchlistButton } from "@/components/public/WatchlistButton";
import { derive, fmtDuration, fmtAge, fmtWhen, overflowKind, type BoardRow } from "@/lib/spillStatus";

export const revalidate = 3600;

type Header = {
  asset_id: string; asset_name: string; asset_code: string | null; asset_type: string | null;
  system_id: string | null; system_name: string | null;
  status: number | null; status_start: string | null; latest_event_start: string | null;
  latest_event_end: string | null; last_updated: string | null;
  dry_all: number; total_all: number; pre_stw_all: number; first_year: number | null;
};
type YearRow = { year: number; dry: number; wet: number; total: number; hours: number };
type EventRow = { event_start: string; event_end: string | null; duration_minutes: number | null; weather_class: "dry" | "wet" | "unknown"; max_rain: number | null; stw_also: boolean };
type Flagged = { kind: "dry" | "prestw"; event_start: string; event_end: string | null; duration_minutes: number | null; max_rain: number | null };

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

  const [{ data: evData }, { data: flData }] = await Promise.all([
    supabase.rpc("public_spill_events" as never, { p_asset: assetId, p_year: year } as never),
    supabase.rpc("public_spill_flagged" as never, { p_asset: assetId } as never),
  ]);
  const events = (evData ?? []) as unknown as EventRow[];
  const flagged = (flData ?? []) as unknown as Flagged[];

  const nowMs = Date.now();
  const d = derive({ ...(header as unknown as BoardRow), dry: 0, wet: 0, total: 0, pre_stw: 0 }, nowMs);
  const yearRow = years.find((y) => y.year === year);
  const hoursYear = yearRow?.hours ?? 0;
  const dryYear = yearRow?.dry ?? 0;
  const preStwYear = events.filter((e) => !e.stw_also).length;
  const maxTotal = Math.max(1, ...years.map((y) => y.total));

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
        } label="Is the feed working?" note={header.last_updated ? `Last reading ${fmtAge(d.feedAgeMin)} ago · expected hourly` : "No readings received yet"} />
        <AnswerCard accent="dry" flexBasis="1 1 240px" title={<span className="font-plexmono text-[30px] leading-none text-rh-dry">{dryYear}</span>} label={`Dry spills, ${year}`}
          note={dryYear === 0 ? `None in ${year} · ${header.dry_all} since 2020` : `${dryYear} in ${year} · ${header.dry_all} since 2020`} link={{ href: "/explore/spills/about", text: "How a dry spill is decided →" }} />
        <AnswerCard accent="prestw" flexBasis="1 1 240px" title={<span className="font-plexmono text-[30px] leading-none text-rh-prestw">{preStwYear}</span>} label={`Spilled before its STW, ${year}`}
          note={`${preStwYear} in ${year} · ${header.pre_stw_all} since 2020`} link={{ href: "/explore/spills/about", text: "What this means →" }} />
      </div>

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
        <FlaggedTable title="Dry spills, every year" accent="border-t-rh-dry" subline={`${dryRows.length} dry spills since 2020 · showing up to 12`} rows={dryRows.slice(0, 12)} rainClass="text-rh-dryDeep" worksLabel="Not spilling" empty="No dry spills on record for this overflow since 2020." />
        <FlaggedTable title="Spilled before its works" accent="border-t-rh-prestw" subline={`${preRows.length} events since 2020 · started while ${header.system_name ?? "its works"} stayed shut`} rows={preRows.slice(0, 12)} rainClass="text-rh-ink3" worksLabel="Stayed shut" empty="This overflow has never been recorded spilling ahead of its treatment works." />
      </div>

      {/* event log */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card">
        <div className="border-b border-rh-lineSoft px-[22px] py-3">
          <h2 className="text-[16px] font-bold text-rh-ink">Every spill in {year}, most recent first</h2>
          <p className="text-[12px] text-rh-ink3">Each event checked against the nearest rain gauge and against the treatment works&apos; own overflow.</p>
        </div>
        <div className="hidden gap-3 bg-rh-cardAlt px-[22px] py-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label sm:flex">
          <div className="flex-[0_0_130px]">Started</div><div className="flex-[0_0_90px]">Duration</div>
          <div className="flex-[0_0_120px]">Rain 24h before</div><div className="flex-[0_0_130px]">Classification</div><div className="flex-[1_1_160px]">STW overflow</div>
        </div>
        {events.slice(0, 80).map((e, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-rh-rowDiv px-[22px] py-3 text-[12.5px] sm:flex-row sm:gap-3">
            <div className="flex-[0_0_130px] font-plexmono text-rh-ink">{fmtWhen(e.event_start)}</div>
            <div className="flex-[0_0_90px] font-plexmono text-rh-ink2">{fmtDuration(e.duration_minutes)}</div>
            <div className="flex-[0_0_120px] font-plexmono text-rh-ink2">{e.max_rain != null ? `${e.max_rain.toFixed(1)} mm` : "—"}</div>
            <div className="flex-[0_0_130px]">{e.weather_class === "dry" ? <Chip variant="dry">Dry spill</Chip> : e.weather_class === "wet" ? <Chip variant="wet">Wet weather</Chip> : <Chip variant="quiet">No rain data</Chip>}</div>
            <div className={`flex-[1_1_160px] ${!e.stw_also ? "text-rh-prestw" : "text-rh-ink2"}`}>{e.stw_also ? "Also spilling" : "Not spilling — flagged before STW"}</div>
          </div>
        ))}
        {events.length === 0 && <p className="px-[22px] py-6 text-center text-[13px] text-rh-ink3">No spills recorded in {year}.</p>}
        {events.length > 80 && <p className="px-[22px] py-3 text-[12px] text-rh-ink3">Showing the last 80 events of {events.length} in {year}.</p>}
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

function FlaggedTable({ title, accent, subline, rows, rainClass, worksLabel, empty }: { title: string; accent: string; subline: string; rows: Flagged[]; rainClass: string; worksLabel: string; empty: string }) {
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
            <div className="flex-[1_1_104px]">Started</div><div className="flex-[0_0_74px]">Length</div><div className="flex-[0_0_66px]">Rain 24h</div><div className="flex-[0_0_82px]">Its works</div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-rh-rowDiv px-[18px] py-2.5 text-[12.5px] sm:flex-row sm:gap-3">
              <div className="flex-[1_1_104px] font-plexmono text-rh-ink">{fmtWhen(r.event_start)}</div>
              <div className="flex-[0_0_74px] font-plexmono text-rh-ink2">{fmtDuration(r.duration_minutes)}</div>
              <div className={`flex-[0_0_66px] font-plexmono font-semibold ${rainClass}`}>{r.max_rain != null ? `${r.max_rain.toFixed(1)}` : "—"}</div>
              <div className="flex-[0_0_82px] font-semibold text-rh-prestw">{worksLabel}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
