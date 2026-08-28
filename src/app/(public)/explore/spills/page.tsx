import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { StatCard } from "@/components/public/StatCard";
import { PeriodBar } from "@/components/public/PeriodBar";
import { SpillsBoardTable } from "@/components/public/SpillsBoardTable";
import { derive, fmtDuration, fmtWhen, type BoardRow } from "@/lib/spillStatus";

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
  const supabase = createPublicClient();

  // available years (from annual data) to build the period bar + default
  const { data: assets } = await supabase.rpc("public_assets");
  const latestYear =
    (assets ?? []).reduce<number | null>((m, a) => (a.latest_year != null && (m == null || a.latest_year > m) ? a.latest_year : m), null) ??
    new Date().getUTCFullYear();
  const year = sp.period && /^\d{4}$/.test(sp.period) ? Number(sp.period) : latestYear;

  const periods = [];
  for (let y = latestYear; y >= 2020; y--) {
    periods.push({ value: String(y), label: y === latestYear ? `${y} so far` : String(y) });
  }

  const { data } = await supabase.rpc("public_spills_board" as never, { p_year: year } as never);
  const rows = (data ?? []) as unknown as BoardRow[];
  const nowMs = Date.now();

  const spillingNow = rows.filter((r) => derive(r, nowMs).status === "spilling");
  const stoppedRecently = rows.filter((r) => derive(r, nowMs).status === "recent").length;
  const dryTotal = rows.reduce((s, r) => s + r.dry, 0);
  const feedsDown = rows.filter((r) => derive(r, nowMs).feed !== "reporting").length;
  const lastUpdated = rows.reduce<number | null>((m, r) => {
    const t = r.last_updated ? Date.parse(r.last_updated) : null;
    return t != null && (m == null || t > m) ? t : m;
  }, null);

  return (
    <div className="space-y-7 py-2">
      {/* title */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink sm:text-[40px]">Sewage spills</h1>
        <p className="max-w-[520px] text-[15px] text-rh-ink2">
          Which storm overflows are spilling into the {INSTANCE.riverName} right now, and which ones are spilling when they shouldn&apos;t.
        </p>
      </div>

      {/* freshness */}
      <p className="font-plexmono text-[11.5px] text-rh-ink3">
        {lastUpdated ? `Updated ${fmtWhen(new Date(lastUpdated).toISOString())}` : "Awaiting first feed"} · {rows.length} assets tracked · feeds polled hourly
      </p>

      <PeriodBar periods={periods} current={String(year)} />

      {/* stat cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          accent="alarm"
          value={spillingNow.length}
          caption="Spilling now"
          subline={spillingNow.length ? spillingNow.slice(0, 3).map((r) => r.asset_name).join(", ") + (spillingNow.length > 3 ? "…" : "") : "Nothing discharging right now"}
        />
        <StatCard accent="amber" value={stoppedRecently} caption="Stopped in last 48 hours" subline="Bacteria can persist for days" />
        <StatCard accent="dry" value={dryTotal.toLocaleString()} caption={`Dry spills, ${year}`} subline="Spilled with no rain — usually a fault" />
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
                  <div className="mt-1 text-[19px] font-bold text-rh-ink">{r.asset_name}</div>
                  {r.system_name && <div className="text-[12.5px] text-rh-ink2">at {r.system_name}</div>}
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

      <SpillsBoardTable rows={rows} periodLabel={String(year)} nowMs={nowMs} />

      <p className="text-[12px] text-rh-ink3">
        Looking for a specific place? The{" "}
        <Link href="/explore/councils" className="text-rh-teal hover:underline">council area pages</Link> break spills and assets down by district and parish.
      </p>
    </div>
  );
}
