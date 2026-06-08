"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface MethodPoint {
  t: number; // epoch ms
  value: number; // E. coli CFU/100mL
  method: string; // "EA (culture)" | "FoD (culture)" | "FoD (Petrifilm)"
}

const COLOURS: Record<string, string> = {
  "EA (culture)": "#1d4ed8",
  "FoD (culture)": "#0f766e",
  "FoD (Petrifilm)": "#d97706",
};

export function MethodComparisonChart({ points }: { points: MethodPoint[] }) {
  if (!points.length) {
    return <p className="text-sm text-gray-500">No E. coli results for this site to compare.</p>;
  }
  const methods = [...new Set(points.map((p) => p.method))];
  const maxV = points.reduce((m, p) => Math.max(m, p.value), 1);
  const decades = [1, 10, 100, 1000, 10000, 100000].filter((d) => d <= maxV * 10);
  const tmin = points.reduce((m, p) => Math.min(m, p.t), Infinity);
  const tmax = points.reduce((m, p) => Math.max(m, p.t), -Infinity);
  const xticks =
    tmin === tmax ? [tmin] : Array.from({ length: 6 }, (_, i) => Math.round(tmin + ((tmax - tmin) * i) / 5));

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
            scale="log"
            domain={[1, decades[decades.length - 1] ?? 10000]}
            ticks={decades}
            tick={{ fontSize: 11 }}
            label={{ value: "CFU/100mL", angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip
            formatter={(v, n) => [`${v} CFU/100mL`, n]}
            labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 10)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {methods.map((m) => (
            <Scatter
              key={m}
              name={m}
              data={points.filter((p) => p.method === m).map((p) => ({ ...p, value: Math.max(p.value, 1) }))}
              fill={COLOURS[m] ?? "#6b7280"}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
