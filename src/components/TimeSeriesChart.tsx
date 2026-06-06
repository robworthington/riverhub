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
} from "recharts";

export interface ChartPoint {
  t: number; // epoch ms (x)
  value: number; // y
  label: string; // date string for tooltip
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
}: {
  points: ChartPoint[];
  unit: string | null;
  thresholds: ThresholdLine[];
}) {
  if (!points.length) {
    return <p className="text-sm text-gray-500">No results to plot for these filters.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="t"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(t) => new Date(t).toISOString().slice(0, 10)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="value"
            tick={{ fontSize: 11 }}
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
          <Scatter data={points} fill="#1d7c8c" line={{ stroke: "#1d7c8c" }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
