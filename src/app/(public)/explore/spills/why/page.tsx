import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { PeriodBar } from "@/components/public/PeriodBar";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Why it keeps happening — ${INSTANCE.portalName}`,
  description: `The worst-performing storm overflows in the ${INSTANCE.riverName} catchment — by hours spilling, by dry-weather spills, and by spills ahead of their treatment works.`,
};

type LeagueRow = { asset_id: string; asset_name: string; asset_code: string | null; hours: number; dry: number; pre_stw: number };
type RepeatRow = { asset_id: string; asset_name: string; asset_code: string | null; years: number; total_dry: number };

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const supabase = createPublicClient();

  const { data: rangeData } = await supabase.rpc("public_spill_year_range" as never, {} as never);
  const range = ((rangeData ?? []) as unknown as { min_year: number | null; max_year: number | null }[])[0];
  const maxYear = range?.max_year ?? new Date().getUTCFullYear();
  const minYear = range?.min_year ?? 2020;
  const isAll = sp.period === "all";
  const pYear = isAll ? null : sp.period && /^\d{4}$/.test(sp.period) ? Number(sp.period) : maxYear;
  const periodValue = isAll ? "all" : String(pYear);
  const periodLabel = isAll ? "all years" : String(pYear);
  const periods = [];
  for (let y = maxYear; y >= minYear; y--) periods.push({ value: String(y), label: y === maxYear ? `${y} so far` : String(y) });
  periods.push({ value: "all", label: "All years" });

  const { data } = await supabase.rpc("public_spills_league" as never, { p_year: pYear } as never);
  const rows = (data ?? []) as unknown as LeagueRow[];

  // repeat offenders are cross-year (not period-scoped) — a persistence signal the period panels can't show
  const { data: repeatData } = await supabase.rpc("public_spills_repeat_offenders" as never, {} as never);
  const repeat = (repeatData ?? []) as unknown as RepeatRow[];

  return (
    <div className="space-y-6 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>

      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Why it keeps happening</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">
          The worst performers in the {INSTANCE.riverName} catchment for <strong>{periodLabel}</strong> — by time spent spilling, by spills in dry weather, and by spills that started while their treatment works stayed shut.
        </p>
      </div>

      <PeriodBar periods={periods} current={periodValue} note="Rankings cover the selected period." />

      <div className="flex flex-wrap items-start gap-3">
        <Panel title="Longest spillers" note="Total hours discharging over the period" rows={rows} metric={(r) => r.hours} suffix=" h" barClass="bg-[#4a6b73]" />
        <Panel title="Worst dry spillers" note="Spills with no rain — usually a fault" rows={rows} metric={(r) => r.dry} barClass="bg-rh-dry" />
        <Panel title="Spilled before their works" note="Upstream overflow spilled while its STW did not" rows={rows} metric={(r) => r.pre_stw} barClass="bg-rh-prestw" />
      </div>

      {repeat.length > 0 && <RepeatOffenders rows={repeat} minYear={minYear} maxYear={maxYear} />}

      <p className="max-w-[720px] text-[12px] text-rh-ink3">
        Hours are estimated from EDM start and stop times. Dry spills use rainfall at the nearest gauge (≤ 0.25 mm on the spill day and the day before). A pre-STW spill is an upstream overflow that spilled on a day its treatment works did not.
      </p>
    </div>
  );
}

function RepeatOffenders({ rows, minYear, maxYear }: { rows: RepeatRow[]; minYear: number; maxYear: number }) {
  const ranked = rows.slice(0, 10);
  const maxYears = ranked.length ? ranked[0].years : 1;
  const span = maxYear - minYear + 1;

  return (
    <section className="rounded-[3px] border border-rh-line bg-rh-card">
      <div className="border-b border-rh-lineSoft px-[18px] pb-3 pt-4">
        <h2 className="text-[16px] font-bold text-rh-ink">Repeat dry-weather offenders</h2>
        <p className="mt-0.5 max-w-[560px] text-[12px] text-rh-ink3">
          Overflows that spilled in dry weather in two or more of the last {span} years. Persistence points to a standing fault or groundwater getting into the sewer — not a one-off storm. Spans all years, so the period above doesn&apos;t change it.
        </p>
      </div>
      {ranked.map((r, i) => (
        <Link
          key={r.asset_id}
          href={`/explore/spills/${r.asset_id}`}
          className="block border-b border-rh-rowDiv px-[18px] py-[11px] hover:bg-rh-rowHover"
        >
          <div className="flex items-baseline gap-2">
            <span className="w-[22px] shrink-0 font-plexmono text-[12px] text-[#97a3a4]">{i + 1}.</span>
            <span className="flex-1 text-[14px] font-semibold text-rh-ink">{r.asset_name}</span>
            <span className="font-plexmono text-[14px] font-semibold text-rh-ink">{r.years} yrs</span>
          </div>
          <div className="ml-[30px] mt-1 flex items-center gap-3">
            <div className="mt-0.5 h-1.5 flex-1 rounded-[2px] bg-rh-lineSoft">
              <div className="h-full rounded-[2px] bg-rh-dry" style={{ width: `${(r.years / maxYears) * 100}%` }} />
            </div>
            <div className="shrink-0 font-plexmono text-[10.5px] text-[#7a8788]">{r.total_dry.toLocaleString()} dry spills in total</div>
          </div>
        </Link>
      ))}
    </section>
  );
}

function Panel({
  title,
  note,
  rows,
  metric,
  suffix = "",
  barClass,
}: {
  title: string;
  note: string;
  rows: LeagueRow[];
  metric: (r: LeagueRow) => number;
  suffix?: string;
  barClass: string;
}) {
  const ranked = rows
    .map((r) => ({ r, v: metric(r) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);
  const max = ranked.length ? ranked[0].v : 1;

  return (
    <div className="flex-[1_1_320px] rounded-[3px] border border-rh-line bg-rh-card">
      <div className="border-b border-rh-lineSoft px-[18px] pb-3 pt-4">
        <h2 className="text-[16px] font-bold text-rh-ink">{title}</h2>
        <p className="mt-0.5 text-[12px] text-rh-ink3">{note}</p>
      </div>
      {ranked.length === 0 ? (
        <p className="px-[18px] py-6 text-[12.5px] text-rh-ink3">Nothing to rank for this period.</p>
      ) : (
        ranked.map(({ r, v }, i) => (
          <Link
            key={r.asset_id}
            href={`/explore/spills/${r.asset_id}`}
            className="block border-b border-rh-rowDiv px-[18px] py-[11px] hover:bg-rh-rowHover"
          >
            <div className="flex items-baseline gap-2">
              <span className="w-[22px] shrink-0 font-plexmono text-[12px] text-[#97a3a4]">{i + 1}.</span>
              <span className="flex-1 text-[14px] font-semibold text-rh-ink">{r.asset_name}</span>
              <span className="font-plexmono text-[14px] font-semibold text-rh-ink">{v.toLocaleString()}{suffix}</span>
            </div>
            <div className="ml-[30px] mt-1">
              <div className="font-plexmono text-[10.5px] text-[#7a8788]">{r.asset_code ?? "—"}</div>
              <div className="mt-1 h-1.5 rounded-[2px] bg-rh-lineSoft">
                <div className={`h-full rounded-[2px] ${barClass}`} style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
