"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactNumber, formatInr, formatPercent } from "@/lib/utils";

export type FormatType = "compact" | "inr" | "percent" | "raw";

function getFormatter(type?: FormatType) {
  switch (type) {
    case "inr": return (v: number) => formatInr(v);
    case "percent": return (v: number) => formatPercent(v);
    case "raw": return (v: number) => String(v);
    case "compact":
    default:
      return (v: number) => formatCompactNumber(v);
  }
}

/** Shared tooltip: reads the app's own surface/border/foreground tokens so
 * it matches the design system in both themes without a separate dark-mode
 * chart palette branch. */
function ChartTooltip({
  active,
  payload,
  label,
  formatType,
}: {
  active?: boolean;
  payload?: { value: number; payload?: Record<string, unknown> }[];
  label?: string;
  formatType?: FormatType;
}) {
  if (!active || !payload || !payload.length) return null;
  const valueFormatter = getFormatter(formatType);
  return (
    <div className="rounded-[var(--radius-md)] border border-border-default bg-[var(--chart-tooltip-bg)] px-3 py-2 text-[12.5px] shadow-md">
      <div className="font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-foreground-muted">{valueFormatter(payload[0].value)}</div>
    </div>
  );
}

const ORDINAL_TOKENS = [
  "var(--chart-ordinal-1)",
  "var(--chart-ordinal-2)",
  "var(--chart-ordinal-3)",
  "var(--chart-ordinal-4)",
  "var(--chart-ordinal-5)",
];

export interface StageDatum {
  label: string;
  value: number;
}

/** Ordered-tier bar chart (funnel stages, scenario tiers) using the single-
 * hue ocean ordinal ramp — stages read as a progression, not distinct
 * categories, so one hue stepped light->dark is the correct encoding
 * (see dataviz skill: "ordinal ramp... funnel stages, tiers"). */
export function StageBarChart({
  data,
  formatType,
  height = 280,
}: {
  data: StageDatum[];
  formatType?: FormatType;
  height?: number;
}) {
  const valueFormatter = getFormatter(formatType);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={{ stroke: "var(--border-default)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactNumber(Number(v))}
          width={48}
        />
        <Tooltip content={<ChartTooltip formatType={formatType} />} cursor={{ fill: "var(--surface-sunken)" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {data.map((_, i) => (
            <Cell key={i} fill={ORDINAL_TOKENS[Math.min(i, ORDINAL_TOKENS.length - 1)]} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v: unknown) => valueFormatter(Number(v))}
            style={{ fill: "var(--foreground-muted)", fontSize: 12, fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface RankDatum {
  label: string;
  value: number;
}

/** Horizontal sorted bar chart for many-item comparisons (per-channel
 * revenue/ROI/allocation across up to 35 channels). A single sequential
 * hue sorted by magnitude — never a 35-color categorical rainbow (see
 * dataviz anti-patterns). Identity of the top item is surfaced via a
 * callout elsewhere on the page, not by recoloring bars. */
export function RankedBarChart({
  data,
  formatType,
  height,
}: {
  data: RankDatum[];
  formatType?: FormatType;
  height?: number;
}) {
  const rowHeight = 30;
  const computedHeight = height ?? Math.max(160, data.length * rowHeight + 24);
  const valueFormatter = getFormatter(formatType);

  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={168}
          tick={{ fill: "var(--foreground)", fontSize: 12.5 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip formatType={formatType} />} cursor={{ fill: "var(--surface-sunken)" }} />
        <Bar dataKey="value" fill="var(--chart-sequential)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => valueFormatter(Number(v))}
            style={{ fill: "var(--foreground-muted)", fontSize: 12, fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
