"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInr, formatCompactNumber, formatPercent } from "@/lib/utils";

export type ForecastMetric = "revenue_inr" | "bookings" | "occupancy_pct";

interface MonthlyPoint {
  month: string;
  value: number;
}

interface ForecastPoint {
  month: string;
  forecastValue: number;
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function formatValue(metric: ForecastMetric, value: number): string {
  if (metric === "revenue_inr") return formatInr(value);
  if (metric === "occupancy_pct") return formatPercent(value, 0);
  return formatCompactNumber(value);
}

function formatAxisTick(metric: ForecastMetric, value: number): string {
  if (metric === "revenue_inr") return `₹${formatCompactNumber(value)}`;
  if (metric === "occupancy_pct") return formatPercent(value, 0);
  return formatCompactNumber(value);
}

interface ChartRow {
  month: string;
  historyValue: number | null;
  forecastValue: number | null;
}

function buildChartData(history: MonthlyPoint[], forecast: ForecastPoint[]): ChartRow[] {
  const rows: ChartRow[] = history.map((h) => ({ month: h.month, historyValue: h.value, forecastValue: null }));
  for (const f of forecast) {
    rows.push({ month: f.month, historyValue: null, forecastValue: f.forecastValue });
  }
  if (history.length > 0 && forecast.length > 0) {
    rows[history.length - 1].forecastValue = rows[history.length - 1].historyValue;
  }
  return rows;
}

function ForecastTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number | null }[];
  label?: string;
  metric: ForecastMetric;
}) {
  if (!active || !payload?.length) return null;
  const historyEntry = payload.find((p) => p.dataKey === "historyValue" && p.value != null);
  const forecastEntry = payload.find((p) => p.dataKey === "forecastValue" && p.value != null);
  const entry = historyEntry ?? forecastEntry;
  if (!entry || entry.value == null) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-border-default bg-surface px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-foreground">{label ? formatMonth(label) : ""}</p>
      <p className="text-foreground-muted">
        {formatValue(metric, entry.value)}
        {forecastEntry && !historyEntry ? <span className="ml-1 text-foreground-faint">(forecast)</span> : null}
      </p>
    </div>
  );
}

export function ForecastTrendChart({
  history,
  forecast,
  metric,
}: {
  history: MonthlyPoint[];
  forecast: ForecastPoint[];
  metric: ForecastMetric;
}) {
  const data = buildChartData(history, forecast);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--color-border-subtle)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-foreground-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => formatAxisTick(metric, v)}
        />
        <Tooltip content={<ForecastTooltip metric={metric} />} />
        <Line
          type="monotone"
          dataKey="historyValue"
          stroke="var(--color-ocean-500)"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "var(--color-ocean-500)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="forecastValue"
          stroke="var(--color-ocean-500)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 2.5, fill: "var(--color-ocean-500)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
