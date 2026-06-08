"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label,
  Legend,
} from "recharts";

export interface ChartPoint {
  t: number; // epoch ms (x)
  value: number; // y
  label: string; // date string for tooltip
  cso?: boolean; // a CSO was discharging at/around sampling time
}
export interface ThresholdLine {
  value: number;
  label: string;
  colour: string;
}

export function TimeSeriesChart({
  points,
  unit,
  thresholds,
  logScale = false,
}: {
  points: ChartPoint[];
  unit: string | null;
  thresholds: ThresholdLine[];
  logScale?: boolean;
}) {
  if (!points.length) {
    return <p className="text-sm text-gray-500">No results to plot for these filters.</p>;
  }
  // Log axes need strictly-positive values and explicit decade ticks (auto-ticks collide).
  const data = logScale ? points.map((p) => ({ ...p, value: Math.max(p.value, 1) })) : points;
  const maxV = data.reduce((m, p) => Math.max(m, p.value), 1);
  const decades = [1, 10, 100, 1000, 10000, 100000].filter((d) => d <= maxV * 10);
  // explicit, evenly-spaced x ticks (auto-ticks collide when many samples share a date)
  const tmin = data.reduce((m, p) => Math.min(m, p.t), Infinity);
  const tmax = data.reduce((m, p) => Math.max(m, p.t), -Infinity);
  const xticks =
    tmin === tmax ? [tmin] : Array.from({ length: 6 }, (_, i) => Math.round(tmin + ((tmax - tmin) * i) / 5));
  // split out samples taken while a CSO was discharging (only if any point carries the flag)
  const hasCso = data.some((p) => p.cso != null);
  const csoPts = hasCso ? data.filter((p) => p.cso === true) : [];
  const normalPts = hasCso ? data.filter((p) => p.cso !== true) : data;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="t"
            domain={[tmin, tmax]}
            scale="time"
            ticks={xticks}
            tickFormatter={(t) => new Date(t).toISOString().slice(0, 10)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="value"
            tick={{ fontSize: 11 }}
            scale={logScale ? "log" : "auto"}
            domain={logScale ? [1, decades[decades.length - 1] ?? 10000] : ["auto", "auto"]}
            ticks={logScale ? decades : undefined}
            allowDataOverflow={false}
            label={unit ? { value: unit, angle: -90, position: "insideLeft", fontSize: 11 } : undefined}
          />
          <Tooltip
            formatter={(v) => [`${v}${unit ? ` ${unit}` : ""}`, "Result"]}
            labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 10)}
          />
          {thresholds.map((th) => (
            <ReferenceLine key={th.label} y={th.value} stroke={th.colour} strokeDasharray="4 2">
              <Label value={th.label} position="right" fontSize={10} fill={th.colour} />
            </ReferenceLine>
          ))}
          {hasCso ? (
            <>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Scatter name="Sample" data={normalPts} fill="#1d7c8c" />
              <Scatter name="CSO discharging" data={csoPts} fill="#dc2626" />
            </>
          ) : (
            <Scatter data={data} fill="#1d7c8c" />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
