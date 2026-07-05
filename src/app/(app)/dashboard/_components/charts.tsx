"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import { formatCompactNumber, formatInr, formatPercent } from "@/lib/utils";

/**
 * Chart primitives for the Financial / Operations dashboards. Per
 * CLAUDE.md ("only use charts where they communicate something
 * meaningful") these are trend charts only — no decorative pie/donut
 * filler. Colors are pulled from the app's CSS custom properties
 * (src/app/globals.css) so they track the light/dark theme automatically;
 * grid/axis ink uses the muted/faint text tokens, series use the brand
 * ocean/orange hues in a fixed order, and polarity (profit vs loss) uses
 * the reserved success/danger status colors — never a repurposed series hue.
 */

const AXIS_TICK = { fontSize: 11, fill: "var(--color-foreground-faint)" };
const GRID_STROKE = "var(--color-border-subtle)";

function shortDate(value: string): string {
  // "YYYY-MM-DD" -> "5 Jul"
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ChartTooltipShell({
  label,
  rows,
}: {
  label?: string | number;
  rows: { name: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-default bg-surface-raised p-3 text-[12px] shadow-md">
      {label != null && <p className="mb-1.5 font-medium text-foreground">{shortDate(String(label))}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="text-foreground-muted">{r.name}</span>
            <span className="ml-auto font-medium text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cash flow trend: Revenue / Expenses lines over Net (profit/loss) bars.
// ---------------------------------------------------------------------------

export interface CashFlowPoint {
  bucket: string;
  revenueInr: number;
  expensesInr: number;
  netInr: number;
}

function CashFlowTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.map((p) => ({
    name: String(p.name ?? p.dataKey),
    value: formatInr(Number(Array.isArray(p.value) ? p.value[0] : (p.value ?? 0))),
    color: String(p.color ?? "var(--color-ocean-500)"),
  }));
  return <ChartTooltipShell label={label} rows={rows} />;
}

export function CashFlowTrendChart({ data }: { data: CashFlowPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          tickFormatter={shortDate}
          minTickGap={28}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => formatCompactNumber(v)}
        />
        <Tooltip content={(props) => <CashFlowTooltip {...props} />} cursor={{ fill: "var(--color-border-subtle)", opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
        <Bar dataKey="netInr" name="Net" radius={[3, 3, 3, 3]} maxBarSize={16}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.netInr >= 0 ? "var(--color-success)" : "var(--color-danger)"}
              fillOpacity={0.32}
            />
          ))}
        </Bar>
        <Line type="monotone" dataKey="revenueInr" name="Revenue" stroke="var(--color-ocean-500)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expensesInr" name="Expenses" stroke="var(--color-orange-500)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Fuel burn trend (daily-aggregated cost).
// ---------------------------------------------------------------------------

export interface FuelBurnPoint {
  date: string;
  costInr: number;
  litersConsumed: number;
}

function FuelBurnTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as FuelBurnPoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell
      label={label}
      rows={[
        { name: "Fuel cost", value: formatInr(point.costInr), color: "var(--color-ocean-500)" },
        { name: "Liters", value: `${formatCompactNumber(point.litersConsumed)} L`, color: "var(--color-foreground-faint)" },
      ]}
    />
  );
}

export function FuelBurnTrendChart({ data }: { data: FuelBurnPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ocean-500)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-ocean-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickFormatter={shortDate} minTickGap={28} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompactNumber(v)} />
        <Tooltip content={(props) => <FuelBurnTooltip {...props} />} cursor={{ stroke: "var(--color-border-default)" }} />
        <Area type="monotone" dataKey="costInr" name="Fuel cost" stroke="var(--color-ocean-500)" strokeWidth={2} fill="url(#fuelFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Trip utilization (occupancy %) trend.
// ---------------------------------------------------------------------------

export interface UtilizationPoint {
  date: string;
  occupancyPct: number;
  passengers: number;
  capacity: number;
}

function UtilizationTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as UtilizationPoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell
      label={label}
      rows={[
        { name: "Occupancy", value: formatPercent(point.occupancyPct), color: "var(--color-ocean-500)" },
        { name: "Passengers / capacity", value: `${point.passengers} / ${point.capacity}`, color: "var(--color-foreground-faint)" },
      ]}
    />
  );
}

export function UtilizationTrendChart({ data }: { data: UtilizationPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="utilFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-palm-500)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-palm-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickFormatter={shortDate} minTickGap={28} />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip content={(props) => <UtilizationTooltip {...props} />} cursor={{ stroke: "var(--color-border-default)" }} />
        <Area type="monotone" dataKey="occupancyPct" name="Occupancy" stroke="var(--color-palm-500)" strokeWidth={2} fill="url(#utilFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Horizontal ranked bar list (revenue-by-type / expense-by-category). Kept as
// a lightweight, self-labeled list rather than a recharts BarChart — at 4-8
// categories a plain ranked list with a proportional bar reads faster than a
// chart with a legend, and needs no separate legend/axis.
// ---------------------------------------------------------------------------

export function RankedAmountBars({
  items,
  color,
}: {
  items: { label: string; amountInr: number }[];
  color: string;
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.amountInr)));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-foreground-muted">{item.label}</span>
            <span className="font-medium text-foreground">{formatInr(item.amountInr)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (Math.abs(item.amountInr) / max) * 100)}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
