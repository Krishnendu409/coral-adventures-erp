"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInr } from "@/lib/utils";

export interface FailureFrequencyDatum {
  component: string;
  totalCostInr: number;
  totalRecords: number;
}

function CostTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: FailureFrequencyDatum }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[var(--radius-md)] border border-border-default bg-surface px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-foreground-muted">Cost: {formatInr(d.totalCostInr)}</p>
      <p className="text-foreground-muted">Records: {d.totalRecords}</p>
    </div>
  );
}

export function FailureFrequencyChart({ data }: { data: FailureFrequencyDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis
          dataKey="component"
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-border-subtle)" }}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
        />
        <YAxis
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => formatInr(v)}
        />
        <Tooltip content={<CostTooltip />} cursor={{ fill: "var(--color-surface-sunken)" }} />
        <Bar dataKey="totalCostInr" fill="var(--color-ocean-500)" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
