"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusDot } from "@/components/public/StatusDot";
import { Chip } from "@/components/public/Chip";
import { MixBar } from "@/components/public/MixBar";
import { derive, boardSort, fmtDuration, fmtAge, fmtWhen, dryFlagTitle, preStwFlagTitle, noneFlagTitle, type BoardRow, type LiveStatus } from "@/lib/spillStatus";
import { OverflowName } from "@/components/public/OverflowName";
import { prettyWorksName } from "@/lib/overflowNames";

const WATCH_KEY = "rh-spill-watchlist";
type Filter = "all" | "now" | "dry" | "before" | "feed" | "watch";

const STATUS_CHIP: Record<Exclude<LiveStatus, "nodata">, { variant: "spilling" | "recent" | "quiet"; label: (d: number | null) => string }> = {
  spilling: { variant: "spilling", label: (m) => `Spilling · ${fmtDuration(m)}` },
  recent: { variant: "recent", label: (m) => `Stopped ${fmtAge(m)} ago` },
  ok: { variant: "quiet", label: () => "Not spilling" },
};

export function SpillsBoardTable({ rows, periodLabel, nowMs }: { rows: BoardRow[]; periodLabel: string; nowMs: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCH_KEY);
      if (raw) setWatch(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* private mode / blocked storage — start empty */
    }
  }, []);

  function toggleWatch(id: string) {
    setWatch((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(WATCH_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const counts = useMemo(() => {
    let now = 0,
      feed = 0;
    for (const r of rows) {
      const d = derive(r, nowMs);
      if (d.status === "spilling") now++;
      if (d.feed !== "reporting") feed++;
    }
    return {
      now,
      feed,
      dry: rows.filter((r) => r.dry > 0).length,
      before: rows.filter((r) => r.pre_stw > 0).length,
      watch: rows.filter((r) => watch.has(r.asset_id)).length,
    };
  }, [rows, nowMs, watch]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const d = derive(r, nowMs);
        if (filter === "now" && d.status !== "spilling") return false;
        if (filter === "dry" && r.dry === 0) return false;
        if (filter === "before" && r.pre_stw === 0) return false;
        if (filter === "feed" && d.feed === "reporting") return false;
        if (filter === "watch" && !watch.has(r.asset_id)) return false;
        if (q && !(`${r.asset_name} ${r.system_name ?? ""}`.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => boardSort(a, b, nowMs));
  }, [rows, filter, query, watch, nowMs]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: `All ${rows.length} assets` },
    { key: "now", label: `Spilling now (${counts.now})` },
    { key: "dry", label: "Dry spills" },
    { key: "before", label: "Before their STW" },
    { key: "feed", label: "Feed problems" },
    { key: "watch", label: `My watchlist (${counts.watch})` },
  ];

  return (
    <div className="rounded-[3px] border border-rh-line bg-rh-card">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rh-lineSoft px-[18px] py-[14px]">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`rounded-[3px] border px-[11px] py-1.5 text-[12.5px] font-semibold ${
                filter === c.key ? "border-rh-ink bg-rh-ink text-white" : "border-[#d5cfc2] bg-rh-card text-rh-ink hover:bg-rh-rowHover"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a village or asset…"
          className="ml-auto w-full rounded-[3px] border border-[#ccc6b8] bg-white px-[11px] py-2 text-[13px] sm:w-60"
        />
      </div>

      {/* key — how to read the flags, kept up top so it's seen before the table. Hover any flag for detail. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-rh-lineSoft bg-rh-cardAlt px-[18px] py-2.5 text-[11.5px] text-rh-ink2">
        <span className="font-semibold text-rh-ink">How to read the flags:</span>
        <span className="flex items-center gap-1.5"><Chip variant="dry">Dry</Chip> spilled with no rain — usually a fault</span>
        <span className="flex items-center gap-1.5"><Chip variant="prestw">Pre-STW</Chip> spilled while its own works stayed shut — a local problem, not the weather</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-rh-wet" /> Wet-weather spills are permitted</span>
        <span className="text-rh-ink3">Spills under 15&nbsp;min excluded. <Link href="/explore/spills/method" className="text-rh-teal hover:underline">Why?</Link></span>
      </div>

      {/* header strip */}
      <div className="hidden gap-3 border-b border-rh-lineSoft bg-rh-cardAlt px-[18px] py-2.5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label sm:flex">
        <div className="min-w-[170px] flex-[1_1_200px]">Asset</div>
        <div className="flex-[0_0_132px]">Status now</div>
        <div className="flex-[0_0_118px]">Feed</div>
        <div className="flex-[0_0_132px]">Flags</div>
        <div className="flex-[0_0_96px]">{periodLabel} spills</div>
      </div>

      {/* rows */}
      {shown.map((r) => {
        const d = derive(r, nowMs);
        const spilling = d.status === "spilling";
        const chip = d.status === "nodata" ? null : STATUS_CHIP[d.status];
        return (
          <div
            key={r.asset_id}
            className={`flex flex-col gap-2 border-b border-rh-rowDiv px-[18px] py-[14px] sm:flex-row sm:gap-3 ${
              spilling ? "bg-[#fffaf8]" : "hover:bg-rh-rowHover"
            }`}
          >
            {/* asset */}
            <div className="flex min-w-[170px] items-start gap-1.5 flex-[1_1_200px]">
              <button
                aria-label={watch.has(r.asset_id) ? "Remove from watchlist" : "Add to watchlist"}
                onClick={() => toggleWatch(r.asset_id)}
                className={`mt-0.5 text-[15px] leading-none ${watch.has(r.asset_id) ? "text-rh-amber" : "text-[#b9c2c1]"}`}
              >
                {watch.has(r.asset_id) ? "★" : "☆"}
              </button>
              <div>
                <Link href={`/explore/spills/${r.asset_id}`} className="text-[14.5px] font-semibold text-rh-ink hover:text-rh-teal">
                  <OverflowName raw={r.asset_name} type={r.asset_type} />
                </Link>
                <div className="font-plexmono text-[11px] text-[#7a8788]">{r.asset_code ?? "—"}</div>
                {r.system_name && <div className="text-[11.5px] text-[#7a8788]">to {prettyWorksName(r.system_name)}</div>}
              </div>
            </div>

            {/* status now */}
            <div className="flex-[0_0_132px]">
              {chip ? <Chip variant={chip.variant}>{chip.label(spilling ? d.spillMinutes : d.stoppedMinutes)}</Chip> : (
                <Chip variant="quiet">Unknown</Chip>
              )}
              <div className="mt-1 text-[11.5px] text-[#7a8788]">
                {spilling ? `Started ${fmtWhen(r.status_start ?? r.latest_event_start)}` : r.latest_event_end ? `Last ended ${fmtWhen(r.latest_event_end)}` : "No record"}
              </div>
            </div>

            {/* feed */}
            <div className="flex flex-[0_0_118px] items-center gap-1.5">
              <StatusDot status={d.feed === "reporting" ? "ok" : d.feed === "quiet" ? "recent" : "nodata"} live={d.feed === "reporting"} />
              <span className={`text-[12.5px] font-semibold ${d.feed === "reporting" ? "text-rh-teal" : d.feed === "quiet" ? "text-rh-amber" : "text-[#8a5a52]"}`}>
                {d.feed === "reporting" ? "Reporting" : d.feed === "quiet" ? `Quiet ${fmtAge(d.feedAgeMin)}` : "No data"}
              </span>
            </div>

            {/* flags */}
            <div className="flex flex-[0_0_132px] flex-wrap gap-1.5">
              {r.dry > 0 && (
                <Chip variant="dry" title={dryFlagTitle(r.dry, periodLabel)}>Dry {r.dry}</Chip>
              )}
              {r.pre_stw > 0 && (
                <Chip variant="prestw" title={preStwFlagTitle(r.pre_stw, periodLabel)}>Pre-STW {r.pre_stw}</Chip>
              )}
              {r.dry === 0 && r.pre_stw === 0 && (
                <span className="cursor-help text-[11.5px] text-rh-quiet" title={noneFlagTitle(periodLabel)}>None</span>
              )}
            </div>

            {/* period spills */}
            <div className="flex-[0_0_96px]">
              <div className="font-plexmono text-[15px] text-rh-ink">{r.total.toLocaleString()}</div>
              <MixBar dry={r.dry} wet={r.wet} className="my-1" />
              <div className="text-[11px] text-[#7a8788]">{r.total === 0 ? "no spills" : r.dry > 0 ? `${r.dry} dry · ${r.wet} wet` : "all wet weather"}</div>
            </div>
          </div>
        );
      })}

      {shown.length === 0 && <p className="px-[18px] py-8 text-center text-[13px] text-rh-ink3">Nothing matches that filter.</p>}
    </div>
  );
}
