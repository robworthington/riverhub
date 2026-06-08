"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface TrendPoint {
  year: number;
  spills: number | null;
  hours: number | null;
}

export function SpillTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 1) {
    return <p className="text-sm text-gray-500">No annual spill history for this asset.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "spills", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "hours", angle: 90, position: "insideRight", fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="spills" name="Spill count" fill="#93c5fd" />
          <Line yAxisId="right" dataKey="hours" name="Total duration (h)" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
