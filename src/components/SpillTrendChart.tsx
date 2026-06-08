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
  dry?: number | null;
  wet?: number | null;
  unknown?: number | null;
}

export function SpillTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 1) {
    return <p className="text-sm text-gray-500">No annual spill history for this asset.</p>;
  }
  // show the dry/wet/unknown breakdown only if we have classified events for some year
  const hasSplit = data.some((d) => d.dry != null || d.wet != null || d.unknown != null);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: hasSplit ? "spill events" : "spills", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "hours", angle: 90, position: "insideRight", fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {hasSplit ? (
            <>
              <Bar yAxisId="left" dataKey="dry" name="Dry-weather spills" stackId="s" fill="#dc2626" />
              <Bar yAxisId="left" dataKey="wet" name="Wet (rain-driven)" stackId="s" fill="#93c5fd" />
              <Bar yAxisId="left" dataKey="unknown" name="No rainfall data" stackId="s" fill="#d1d5db" />
            </>
          ) : (
            <Bar yAxisId="left" dataKey="spills" name="Spill count" fill="#93c5fd" />
          )}
          <Line yAxisId="right" dataKey="hours" name="Total duration (h)" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
