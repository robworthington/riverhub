// Daily rainfall (bars) and river flow (line) for the public Rain and river flow pages. Server-rendered
// SVG, no client JS. Days with no reading are left as gaps, not drawn as zero.

const W = 640;
const H = 170;
const PAD = { l: 40, r: 8, t: 10, b: 24 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function fmtTick(v: number): string {
  return v >= 10 || v === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function axes(fromMs: number, toMs: number, hi: number, unit: string) {
  const x = (t: number) => PAD.l + ((t - fromMs) / Math.max(1, toMs - fromMs)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const step = niceMax(hi / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= hi + step / 1e6; v += step) ticks.push(+v.toPrecision(10));
  // a label on the first of each month (every other month on a long range)
  const months: number[] = [];
  const d = new Date(fromMs);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.getTime() < toMs; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
  const every = months.length > 7 ? 2 : 1;
  const grid = (
    <>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e4e8eb" strokeWidth={0.75} />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#5b6a6c" className="font-plexmono">{fmtTick(v)}</text>
        </g>
      ))}
      {months.map((t, i) => (i % every === 0 ? (
        <text key={t} x={x(t) + 2} y={H - 7} fontSize={11} fill="#5b6a6c">
          {MONTHS[new Date(t).getUTCMonth()]}{new Date(t).getUTCMonth() === 0 ? ` ${new Date(t).getUTCFullYear()}` : ""}
        </text>
      ) : null))}
      <text x={PAD.l} y={PAD.t - 1} fontSize={10.5} fill="#5b6a6c">{unit}</text>
    </>
  );
  return { x, y, grid };
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function RainBars({ readings, label, threshold }: { readings: [string, number | null][]; label: string; threshold: number }) {
  const pts = readings.filter(([, v]) => v != null) as [string, number][];
  if (!pts.length) return null;
  const fromMs = day(pts[0][0]);
  const toMs = day(pts[pts.length - 1][0]) + 86_400_000;
  const hi = niceMax(Math.max(...pts.map(([, v]) => v), 5) * 1.05);
  const { x, y, grid } = axes(fromMs, toMs, hi, "mm a day");
  const bw = Math.max(0.8, (W - PAD.l - PAD.r) / ((toMs - fromMs) / 86_400_000) - 0.4);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {grid}
      {pts.map(([d, v]) => (
        <rect key={d} x={x(day(d))} width={bw} y={y(v)} height={Math.max(0, y(0) - y(v))}
          fill={v > threshold ? "#3f6f8f" : "#c9d5dd"}>
          <title>{`${d}: ${v} mm`}</title>
        </rect>
      ))}
    </svg>
  );
}

export function FlowLine({ readings, label }: { readings: [string, number | null][]; label: string }) {
  const pts = readings.filter(([, v]) => v != null) as [string, number][];
  if (pts.length < 2) return null;
  const fromMs = day(pts[0][0]);
  const toMs = day(pts[pts.length - 1][0]) + 86_400_000;
  const hi = niceMax(Math.max(...pts.map(([, v]) => v)) * 1.05);
  const { x, y, grid } = axes(fromMs, toMs, hi, "m³/s");
  // break the line where a day is missing
  let path = "";
  let prev = 0;
  for (const [d, v] of pts) {
    const t = day(d);
    path += `${path && t - prev <= 86_400_000 * 1.5 ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
    prev = t;
  }
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      {grid}
      <path d={path} fill="none" stroke="#12314B" strokeWidth={1.4} />
    </svg>
  );
}
