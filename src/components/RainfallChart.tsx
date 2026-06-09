"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface RainPoint {
  t: number; // epoch ms
  mm: number;
}

export function RainfallChart({ points }: { points: RainPoint[] }) {
  if (!points.length) {
    return <p className="text-sm text-gray-500">No rainfall readings to plot.</p>;
  }
  const tmin = points.reduce((m, p) => Math.min(m, p.t), Infinity);
  const tmax = points.reduce((m, p) => Math.max(m, p.t), -Infinity);
  const xticks =
    tmin === tmax ? [tmin] : Array.from({ length: 6 }, (_, i) => Math.round(tmin + ((tmax - tmin) * i) / 5));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="t"
            domain={[tmin, tmax]}
            scale="time"
            ticks={xticks}
            tickFormatter={(t) => new Date(t).toISOString().slice(0, 10)}
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} label={{ value: "mm/day", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <Tooltip
            formatter={(v) => [`${v} mm`, "Rainfall"]}
            labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 10)}
          />
          <Area type="monotone" dataKey="mm" stroke="#2563eb" strokeWidth={1.5} fill="url(#rainFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
