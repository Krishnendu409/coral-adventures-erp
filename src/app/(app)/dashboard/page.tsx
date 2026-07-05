import {
  Ship,
  IndianRupee,
  TrendingUp,
  Fuel,
  Star,
  Wrench,
  Upload,
  CalendarClock,
  Wallet,
  Gauge,
} from "lucide-react";
import { getExecutiveSummary } from "@/server/domain/analytics/executive";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, StatTile, Callout, LinkButton } from "@/components/ui";
import { formatInr, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ExecutiveDashboardPage() {
  const summary = getExecutiveSummary();

  const noTripsToday = summary.todayTripCount === 0;
  const cashFlowNegative = summary.cashFlow.netInr < 0;
  const hasMaintenanceAlerts = summary.openMaintenanceAlerts > 0;
  const hasPendingImports = summary.pendingImports > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Executive Dashboard</h1>
        <p className="mt-1 text-[13px] text-foreground-muted">{formatDateLabel(summary.date)}</p>
      </div>

      {(hasPendingImports || hasMaintenanceAlerts || cashFlowNegative || noTripsToday) && (
        <div className="grid gap-3 md:grid-cols-2">
          {hasPendingImports && (
            <Callout tone="warning" title="Imports waiting">
              {summary.pendingImports} import batch{summary.pendingImports === 1 ? "" : "es"} still need attention.{" "}
              <a href="/import" className="font-semibold underline">
                Go to Import Trips
              </a>
              .
            </Callout>
          )}
          {hasMaintenanceAlerts && (
            <Callout tone="warning" title="Maintenance needs attention">
              {summary.openMaintenanceAlerts} maintenance item{summary.openMaintenanceAlerts === 1 ? "" : "s"} open or due
              within 14 days.{" "}
              <a href="/dashboard/maintenance" className="font-semibold underline">
                View Maintenance Intelligence
              </a>
              .
            </Callout>
          )}
          {cashFlowNegative && (
            <Callout tone="danger" title="Negative cash flow">
              Over the last {summary.cashFlow.windowDays} days, expenses ({formatInr(summary.cashFlow.expensesInr)})
              exceeded revenue ({formatInr(summary.cashFlow.revenueInr)}) by {formatInr(Math.abs(summary.cashFlow.netInr))}.
            </Callout>
          )}
          {noTripsToday && (
            <Callout tone="info" title="No trips recorded for today yet">
              This will fill in automatically once today&apos;s trip is generated and, after sailing, imported. Nothing
              to worry about if the day hasn&apos;t started yet.
            </Callout>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatTile label="Today's Trips" value={String(summary.todayTripCount)} icon={<Ship size={20} />} intent="primary" />
        <StatTile label="Today's Revenue" value={formatInr(summary.todayRevenueInr)} icon={<IndianRupee size={20} />} intent="warning" />
        <StatTile
          label="Today's Profit"
          value={formatInr(summary.todayProfitInr)}
          icon={<TrendingUp size={20} />}
          intent={summary.todayProfitInr < 0 ? "danger" : "success"}
        />
        <StatTile label="Today's Occupancy" value={formatPercent(summary.todayOccupancyPct)} icon={<Gauge size={20} />} intent="info" />
        <StatTile label="Today's Fuel Cost" value={formatInr(summary.todayFuelCostInr)} icon={<Fuel size={20} />} intent="neutral" />
        <StatTile
          label={`NPS (${summary.nps.windowDays}d)`}
          value={summary.nps.score == null ? "—" : summary.nps.score.toFixed(0)}
          icon={<Star size={20} />}
          intent="warning"
          deltaLabel={summary.nps.responses === 0 ? "no responses yet" : `${summary.nps.responses} responses`}
        />
        <StatTile
          label="Open Maintenance Alerts"
          value={String(summary.openMaintenanceAlerts)}
          icon={<Wrench size={20} />}
          intent={hasMaintenanceAlerts ? "danger" : "neutral"}
        />
        <StatTile
          label="Pending Imports"
          value={String(summary.pendingImports)}
          icon={<Upload size={20} />}
          intent="info"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cash Flow — trailing {summary.cashFlow.windowDays} days</CardTitle>
              <CardDescription>Revenue and expenses recognized on the date cash actually moved.</CardDescription>
            </div>
            <Wallet size={18} className="text-foreground-faint" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-foreground-muted">Revenue</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{formatInr(summary.cashFlow.revenueInr)}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-foreground-muted">Expenses</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{formatInr(summary.cashFlow.expensesInr)}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-foreground-muted">Net</p>
                <p className={`mt-1 text-xl font-semibold ${cashFlowNegative ? "text-danger" : "text-success"}`}>
                  {formatInr(summary.cashFlow.netInr)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upcoming Bookings</CardTitle>
              <CardDescription>Confirmed passengers for future trips.</CardDescription>
            </div>
            <CalendarClock size={18} className="text-foreground-faint" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{summary.upcomingBookingsCount}</p>
            <p className="mt-1 text-[13px] text-foreground-muted">confirmed bookings still to sail</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <LinkButton href="/import" variant="secondary">
          Import Trips
        </LinkButton>
        <LinkButton href="/downloads" variant="secondary">
          Download Center
        </LinkButton>
        <LinkButton href="/reports" variant="secondary">
          Reports
        </LinkButton>
      </div>
    </div>
  );
}
