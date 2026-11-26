import { BANDS, BAND_EDGES, BAND_META, type Band, type TestKey } from "@/lib/riverHealth";

// One test's readings at an EA sampling point over time, drawn on the river-standard bands
// (design option D). Server-rendered SVG: no client JS. Readings below the lab's detection limit are
// hollow dots at the limit itself.

export type WqReading = { t: number; v: number; below: boolean };

const W = 560;
const H = 190;
const PAD = { l: 46, r: 10, t: 10, b: 26 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function fmtTick(v: number): string {
  if (v === 0) return "0";
  if (v >= 10) return String(Math.round(v));
  if (v >= 1) return v.toFixed(1).replace(/\.0$/, "");
  return v.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** The y-range of each band, clipped to the chart's [lo, hi]. */
function bandRanges(test: TestKey, lo: number, hi: number): { band: Band; from: number; to: number }[] {
  const e = BAND_EDGES[test];
  const cuts = test === "oxygen"
    ? [{ band: "bad" as Band, from: -Infinity, to: e.poor }, { band: "poor" as Band, from: e.poor, to: e.moderate },
       { band: "moderate" as Band, from: e.moderate, to: e.good }, { band: "good" as Band, from: e.good, to: e.high },
       { band: "high" as Band, from: e.high, to: Infinity }]
    : [{ band: "high" as Band, from: -Infinity, to: e.high }, { band: "good" as Band, from: e.high, to: e.good },
       { band: "moderate" as Band, from: e.good, to: e.moderate }, { band: "poor" as Band, from: e.moderate, to: e.poor },
       { band: "bad" as Band, from: e.poor, to: Infinity }];
  return cuts
    .map((c) => ({ band: c.band, from: Math.max(lo, c.from), to: Math.min(hi, c.to) }))
    .filter((c) => c.to > c.from);
}

export function WqChart({
  readings, test, unit, label, from, to,
}: { readings: WqReading[]; test: TestKey | null; unit: string; label: string; from: number; to: number }) {
  const vals = readings.map((r) => r.v);
  const vmax = Math.max(...vals, 0);
  const vmin = Math.min(...vals);
  // oxygen and temperature read best from a floor near their data; concentrations start at zero
  let lo = 0;
  let hi = niceMax(vmax * 1.08);
  if (test === "oxygen") {
    lo = Math.max(0, Math.floor(Math.min(vmin, 50) / 10) * 10);
    hi = Math.max(110, Math.ceil(vmax / 10) * 10);
  } else if (!test) {
    lo = Math.floor(Math.min(vmin, 0));
    hi = niceMax(Math.max(vmax, 1) * 1.08);
  } else {
    // keep the good line in view, so a clean point still shows how far below it sits
    hi = niceMax(Math.max(vmax, BAND_EDGES[test].good * 1.4) * 1.08);
  }
  const span = Math.max(1, to - from);
  const x = (t: number) => PAD.l + ((t - from) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  // round tick steps (0.1, 0.25, 20…), not quarters of the range
  const tstep = niceMax((hi - lo) / 4.5);
  hi = Math.ceil(hi / tstep - 1e-9) * tstep;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tstep) * tstep; v <= hi + tstep / 1e6; v += tstep) ticks.push(+v.toPrecision(10));
  const years: number[] = [];
  for (let yr = new Date(from).getUTCFullYear() + 1; Date.UTC(yr, 0, 1) < to; yr++) years.push(yr);
  const step = years.length > 8 ? Math.ceil(years.length / 8) : 1;
  const sorted = [...readings].sort((a, b) => a.t - b.t);
  const line = sorted.map((r) => `${x(r.t).toFixed(1)},${y(Math.min(r.v, hi)).toFixed(1)}`).join(" ");

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {test && bandRanges(test, lo, hi).map((b) => (
        <rect key={b.band} x={PAD.l} width={W - PAD.l - PAD.r} y={y(b.to)} height={y(b.from) - y(b.to)}
          fill={BAND_META[b.band].bg} fillOpacity={0.16} />
      ))}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#d9dfe3" strokeWidth={0.75} />
          <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={12} fill="#5b6a6c" className="font-plexmono">{fmtTick(v)}</text>
        </g>
      ))}
      {years.filter((_, i) => i % step === 0).map((yr) => (
        <g key={yr}>
          <line x1={x(Date.UTC(yr, 0, 1))} x2={x(Date.UTC(yr, 0, 1))} y1={PAD.t} y2={H - PAD.b} stroke="#e4e8eb" strokeWidth={0.75} />
          <text x={x(Date.UTC(yr, 0, 1)) + 3} y={H - 8} fontSize={12} fill="#5b6a6c">{yr}</text>
        </g>
      ))}
      {sorted.length > 1 && <polyline points={line} fill="none" stroke="#12314B" strokeWidth={1.25} strokeOpacity={0.55} />}
      {sorted.map((r, i) => (
        <circle key={i} cx={x(r.t)} cy={y(Math.min(r.v, hi))} r={2.6}
          fill={r.below ? "#ffffff" : "#12314B"} stroke="#12314B" strokeWidth={r.below ? 1.2 : 0}>
          <title>{`${new Date(r.t).toISOString().slice(0, 10)}: ${r.below ? "below " : ""}${r.v} ${unit}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function BandKey({ test }: { test: TestKey }) {
  const e = BAND_EDGES[test];
  const up = test === "oxygen";
  const edge = (b: Band) =>
    b === "bad" ? (up ? `< ${e.poor}` : `> ${e.poor}`)
    : up ? `≥ ${e[b as keyof typeof e]}` : `≤ ${e[b as keyof typeof e]}`;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {BANDS.map((b) => (
        <span key={b} className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: BAND_META[b].bg }} />
          {BAND_META[b].label} {edge(b)}
        </span>
      ))}
    </span>
  );
}
