import { FileDown, CalendarRange, FileText, FileSpreadsheet, Download } from "lucide-react";
import { getFinancialSummary } from "@/server/domain/analytics/financial";
import { todayStr } from "@/server/domain/analytics/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, LinkButton } from "@/components/ui";
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
  const day = today.getUTCDay() || 7;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (day - 1));
  return start;
}

function buildPresets(): Preset[] {
  const to = todayStr();
  const now = new Date(to + "T00:00:00Z");
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); 

  const weekStart = startOfIsoWeek(now);
  const quarterStartMonth = Math.floor(m / 3) * 3;

  return [
    { label: "This Month", from: isoDate(y, m + 1, 1), to },
    { label: "This Quarter", from: isoDate(y, quarterStartMonth + 1, 1), to },
    { label: "This Year", from: isoDate(y, 1, 1), to },
  ];
}

export default function ReportsPage() {
  const presets = buildPresets();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Company Reports</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-foreground-muted">
          Generate company-grade executive summaries and financial reports. Reports include high-level KPIs, 
          operational metrics, and detailed financial breakdowns.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset) => {
          const summary = getFinancialSummary(undefined, { from: preset.from, to: preset.to });
          const baseHref = `/api/downloads/executive-report?startDate=${preset.from}&endDate=${preset.to}&label=${encodeURIComponent(preset.label)}`;
          return (
            <Card key={preset.label} className="border-border hover:shadow-sm transition-shadow">
              <CardHeader>
                <div>
                  <CardTitle className="text-base">{preset.label} Executive Summary</CardTitle>
                  <CardDescription>
                    {preset.from} to {preset.to}
                  </CardDescription>
                </div>
                <CalendarRange size={18} className="text-foreground-faint" />
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-3 gap-2 text-center bg-surface/50 p-3 rounded-md">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Revenue</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatInr(summary.revenue.totalInr)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Expenses</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatInr(summary.expenses.totalInr)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Profit</p>
                    <p
                      className={`mt-1 text-sm font-semibold ${summary.profitInr < 0 ? "text-danger" : "text-success"}`}
                    >
                      {formatInr(summary.profitInr)}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted text-center">Export Format</p>
                  <div className="flex gap-2">
                    <LinkButton href={`${baseHref}&format=pdf`} variant="outline" size="sm" className="flex-1 border-border/80 text-foreground-muted hover:text-foreground">
                      <FileText size={14} className="mr-1.5" /> PDF
                    </LinkButton>
                    <LinkButton href={`${baseHref}&format=docx`} variant="outline" size="sm" className="flex-1 border-border/80 text-foreground-muted hover:text-foreground">
                      <FileDown size={14} className="mr-1.5" /> DOCX
                    </LinkButton>
                    <LinkButton href={`${baseHref}&format=csv`} variant="outline" size="sm" className="flex-1 border-border/80 text-foreground-muted hover:text-foreground">
                      <FileSpreadsheet size={14} className="mr-1.5" /> CSV
                    </LinkButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
