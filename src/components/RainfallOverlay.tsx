"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface OverlayPoint {
  date: string;
  rainfall: number | null;
  result: number | null;
}

export function RainfallOverlay({ data, unit }: { data: OverlayPoint[]; unit: string | null }) {
  if (!data.length) {
    return <p className="text-sm text-gray-500">No overlapping data to plot yet.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: unit ?? "result", angle: 90, position: "insideRight", fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="rainfall" name="Rainfall (mm)" fill="#93c5fd" />
          <Scatter yAxisId="right" dataKey="result" name={`Result${unit ? ` (${unit})` : ""}`} fill="#1d7c8c" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
