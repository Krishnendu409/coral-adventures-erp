import { FileDown, CalendarRange } from "lucide-react";
import { getFinancialSummary } from "@/server/domain/analytics/financial";
import { todayStr } from "@/server/domain/analytics/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, LinkButton, Callout } from "@/components/ui";
import { formatInr } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Preset {
  label: string;
  from: string;
  to: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function startOfIsoWeek(today: Date): Date {
  const day = today.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (day - 1));
  return start;
}

function buildPresets(): Preset[] {
  const to = todayStr();
  const now = new Date(to + "T00:00:00Z");
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed

  const weekStart = startOfIsoWeek(now);
  const quarterStartMonth = Math.floor(m / 3) * 3;

  return [
    { label: "Today", from: to, to },
    { label: "This Week", from: isoDate(weekStart.getUTCFullYear(), weekStart.getUTCMonth() + 1, weekStart.getUTCDate()), to },
    { label: "This Month", from: isoDate(y, m + 1, 1), to },
    { label: "This Quarter", from: isoDate(y, quarterStartMonth + 1, 1), to },
    { label: "This Year", from: isoDate(y, 1, 1), to },
  ];
}

export default function ReportsPage() {
  const presets = buildPresets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-foreground-muted">
          Financial summary exports for standard reporting periods. Each is computed live from bookings, payments,
          and expenses.
        </p>
      </div>

      <Callout tone="info" title="Scope of this pass">
        Full PDF reports and the complete daily/weekly/monthly/quarterly/yearly reporting matrix (CLAUDE.md Phase 9)
        are tracked as a backlog item. This page covers real, working CSV exports of the Financial Summary for each
        period below.
      </Callout>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset) => {
          const summary = getFinancialSummary(undefined, { from: preset.from, to: preset.to });
          const href = `/api/reports/financial-csv?from=${preset.from}&to=${preset.to}&label=${encodeURIComponent(preset.label)}`;
          return (
            <Card key={preset.label}>
              <CardHeader>
                <div>
                  <CardTitle>{preset.label}</CardTitle>
                  <CardDescription>
                    {preset.from} to {preset.to}
                  </CardDescription>
                </div>
                <CalendarRange size={18} className="text-foreground-faint" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Revenue</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatInr(summary.revenue.totalInr)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Expenses</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatInr(summary.expenses.totalInr)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Profit</p>
                    <p
                      className={`mt-1 text-sm font-semibold ${summary.profitInr < 0 ? "text-danger" : "text-success"}`}
                    >
                      {formatInr(summary.profitInr)}
                    </p>
                  </div>
                </div>
                <LinkButton href={href} variant="secondary" size="sm" className="w-full">
                  <FileDown size={14} /> Download CSV
                </LinkButton>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
