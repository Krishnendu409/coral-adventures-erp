"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface NpsTrendPoint {
  month: string;
  npsScore: number | null;
  avgOverall: number | null;
  responses: number;
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-[var(--radius-md)] border border-border-default bg-surface px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-foreground">{label ? formatMonth(label) : ""}</p>
      <p className="text-foreground-muted">NPS: {point.value == null ? "—" : point.value.toFixed(0)}</p>
    </div>
  );
}

export function NpsTrendChart({ data }: { data: NpsTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--color-border-subtle)" }}
          tickLine={false}
        />
        <YAxis
          domain={[-100, 100]}
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<TrendTooltip />} />
        <Line
          type="monotone"
          dataKey="npsScore"
          stroke="var(--color-ocean-500)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-ocean-500)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
