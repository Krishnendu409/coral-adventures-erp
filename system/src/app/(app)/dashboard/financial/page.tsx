import { Inbox } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatTile,
  Callout,
  EmptyState,
  Badge,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import { formatInr, formatPercent } from "@/lib/utils";
import { trailingRange, daysBetween, addDaysStr, round2, type DateRange } from "@/server/domain/analytics/shared";
import {
  getFinancialSummary,
  getCashFlowTrend,
  getPerRouteProfit,
  getPerCruiseTypeProfit,
  getPayrollTotal,
  getVendorPaymentTotals,
} from "@/server/domain/analytics/financial";
import { DateRangePicker } from "../_components/date-range-picker";
import { CashFlowTrendChart, RankedAmountBars, type CashFlowPoint } from "../_components/charts";
import { getRouteNames, getCruiseTypeNames } from "../_lib/names";
import { monsoonMonthFraction, formatRangeLabel } from "../_lib/season";

function parseRange(sp: { from?: string; to?: string }): DateRange {
  if (sp.from && sp.to) return { from: sp.from, to: sp.to };
  return trailingRange(90);
}

function previousPeriod(range: DateRange): DateRange {
  const lengthDays = daysBetween(range.from, range.to) + 1;
  return { from: addDaysStr(range.from, -lengthDays), to: addDaysStr(range.from, -1) };
}

function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return round2(((curr - prev) / Math.abs(prev)) * 100);
}

function labelize(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  ticket: "Ticket sales",
  onboard: "Onboard sales",
  charter: "Charter bookings",
  refund: "Refunds",
};

export default async function FinancialDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const prevRange = previousPeriod(range);

  const summary = getFinancialSummary(undefined, range);
  const prevSummary = getFinancialSummary(undefined, prevRange);

  const rangeDays = daysBetween(range.from, range.to);
  const granularity = rangeDays > 60 ? "week" : "day";
  const cashFlow = getCashFlowTrend(undefined, range, granularity);

  const perRoute = getPerRouteProfit(undefined, range).sort((a, b) => b.profitInr - a.profitInr);
  const perCruiseType = getPerCruiseTypeProfit(undefined, range).sort((a, b) => b.profitInr - a.profitInr);
  const payroll = getPayrollTotal(undefined, range);
  const vendors = getVendorPaymentTotals(undefined, range);

  const routeNames = getRouteNames();
  const cruiseTypeNames = getCruiseTypeNames();

  const monsoonFraction = monsoonMonthFraction(range);
  const isNegativeMargin = summary.netMarginPct !== null && summary.netMarginPct < 0;

  const revenueDelta = pctDelta(summary.revenue.totalInr, prevSummary.revenue.totalInr);
  // Expenses rising is a negative signal for the business even though the
  // raw number went up, so the delta sign is inverted before it reaches
  // StatTile's generic up=good/down=bad coloring.
  const expenseDeltaRaw = pctDelta(summary.expenses.totalInr, prevSummary.expenses.totalInr);
  const expenseDelta = expenseDeltaRaw === null ? null : -expenseDeltaRaw;
  const profitDelta = pctDelta(summary.profitInr, prevSummary.profitInr);

  const revenueRows = Object.entries(summary.revenue.byPaymentType)
    .map(([type, amountInr]) => ({ label: PAYMENT_TYPE_LABELS[type] ?? labelize(type), amountInr }))
    .sort((a, b) => Math.abs(b.amountInr) - Math.abs(a.amountInr));

  const expenseRows = Object.entries(summary.expenses.byCategory)
    .map(([category, amountInr]) => ({ label: labelize(category), amountInr }))
    .sort((a, b) => Math.abs(b.amountInr) - Math.abs(a.amountInr));

  const cashFlowPoints: CashFlowPoint[] = cashFlow.map((b) => ({
    bucket: b.bucket,
    revenueInr: b.revenueInr,
    expensesInr: b.expensesInr,
    netInr: b.netInr,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Financial Intelligence</h1>
          <p className="mt-1 text-[13px] text-foreground-muted">{formatRangeLabel(range)}</p>
        </div>
        <DateRangePicker from={range.from} to={range.to} />
      </div>

      {isNegativeMargin && (
        <Callout tone={monsoonFraction >= 0.5 ? "info" : "warning"} title={monsoonFraction >= 0.5 ? "Seasonal low, not a problem" : "Net margin is negative"}>
          {monsoonFraction >= 0.5 ? (
            <>
              Net margin is {formatPercent(summary.netMarginPct ?? 0)} for this period, which mostly overlaps the
              Jun–Sep monsoon low season — trip volume and the seasonality index both drop sharply in these months
              (June runs at roughly 15% of peak-season demand). A negative margin here is expected operating
              behavior, not a fault; revisit once the selected range shifts back into peak or shoulder months.
            </>
          ) : (
            <>
              Net margin is {formatPercent(summary.netMarginPct ?? 0)} for this period, and this window does not
              mostly fall in the Jun–Sep monsoon low season — worth investigating the cost breakdown below rather
              than attributing it to seasonality.
            </>
          )}
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Revenue" value={formatInr(summary.revenue.totalInr)} delta={revenueDelta} deltaLabel="vs prior period" />
        <StatTile label="Expenses" value={formatInr(summary.expenses.totalInr)} delta={expenseDelta} deltaLabel="vs prior period" />
        <StatTile label="Profit" value={formatInr(summary.profitInr)} delta={profitDelta} deltaLabel="vs prior period" />
        <StatTile label="Gross Margin" value={summary.grossMarginPct !== null ? formatPercent(summary.grossMarginPct) : "—"} />
        <StatTile label="Net Margin" value={summary.netMarginPct !== null ? formatPercent(summary.netMarginPct) : "—"} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cash Flow Trend</CardTitle>
            <CardDescription>
              Revenue and expenses by {granularity === "week" ? "week" : "day"} of payment/expense date, with net
              (profit/loss) shown as bars.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {cashFlowPoints.length === 0 ? (
            <EmptyState icon={<Inbox size={28} />} title="No cash flow activity" description="No payments or expenses were recorded in this date range." />
          ) : (
            <CashFlowTrendChart data={cashFlowPoints} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Revenue by Type</CardTitle>
              <CardDescription>Ticket, onboard, charter, and refunds — net of refunds already applied.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {revenueRows.length === 0 ? (
              <EmptyState icon={<Inbox size={24} />} title="No revenue recorded" />
            ) : (
              <RankedAmountBars items={revenueRows} color="var(--color-ocean-500)" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Expenses by Category</CardTitle>
              <CardDescription>Fuel and inventory are treated as variable cost; the rest is fixed/overhead.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {expenseRows.length === 0 ? (
              <EmptyState icon={<Inbox size={24} />} title="No expenses recorded" />
            ) : (
              <RankedAmountBars items={expenseRows} color="var(--color-orange-500)" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profit by Route</CardTitle>
            <CardDescription>Which routes are most (and least) profitable — a Decision Support signal for scheduling and expansion.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {perRoute.length === 0 ? (
            <EmptyState icon={<Inbox size={24} />} title="No trips in this range" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Route</TableHeaderCell>
                  <TableHeaderCell>Trips</TableHeaderCell>
                  <TableHeaderCell>Revenue</TableHeaderCell>
                  <TableHeaderCell>Expenses</TableHeaderCell>
                  <TableHeaderCell>Profit</TableHeaderCell>
                  <TableHeaderCell>Margin</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perRoute.map((r, i) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {routeNames[r.key] ?? r.key}
                        {i === 0 && r.profitInr > 0 && <Badge tone="success">Most profitable</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{r.tripCount}</TableCell>
                    <TableCell>{formatInr(r.revenueInr)}</TableCell>
                    <TableCell>{formatInr(r.expensesInr)}</TableCell>
                    <TableCell className={r.profitInr < 0 ? "text-danger" : "text-success"}>{formatInr(r.profitInr)}</TableCell>
                    <TableCell>{r.revenueInr > 0 ? formatPercent((r.profitInr / r.revenueInr) * 100) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profit by Cruise Type</CardTitle>
            <CardDescription>Attributed at the trip level (expenses are trip-scoped facts).</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {perCruiseType.length === 0 ? (
            <EmptyState icon={<Inbox size={24} />} title="No trips in this range" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Cruise Type</TableHeaderCell>
                  <TableHeaderCell>Trips</TableHeaderCell>
                  <TableHeaderCell>Revenue</TableHeaderCell>
                  <TableHeaderCell>Expenses</TableHeaderCell>
                  <TableHeaderCell>Profit</TableHeaderCell>
                  <TableHeaderCell>Margin</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perCruiseType.map((r, i) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {cruiseTypeNames[r.key] ?? r.key}
                        {i === 0 && r.profitInr > 0 && <Badge tone="success">Most profitable</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{r.tripCount}</TableCell>
                    <TableCell>{formatInr(r.revenueInr)}</TableCell>
                    <TableCell>{formatInr(r.expensesInr)}</TableCell>
                    <TableCell className={r.profitInr < 0 ? "text-danger" : "text-success"}>{formatInr(r.profitInr)}</TableCell>
                    <TableCell>{r.revenueInr > 0 ? formatPercent((r.profitInr / r.revenueInr) * 100) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payroll</CardTitle>
              <CardDescription>{payroll.monthsInRange} calendar month(s) counted in this range.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatTile label="Total Payroll" value={formatInr(payroll.totalInr)} />
            {payroll.byCrew.length === 0 ? (
              <EmptyState icon={<Inbox size={24} />} title="No crew employed in this range" />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Crew</TableHeaderCell>
                    <TableHeaderCell>Months</TableHeaderCell>
                    <TableHeaderCell>Total</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payroll.byCrew.map((c) => (
                    <TableRow key={c.crewId}>
                      <TableCell className="font-medium">{c.fullName}</TableCell>
                      <TableCell>{c.monthsCounted}</TableCell>
                      <TableCell>{formatInr(c.totalInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Vendor Payments</CardTitle>
              <CardDescription>Expense totals grouped by vendor.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <EmptyState icon={<Inbox size={24} />} title="No vendor expenses in this range" />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Vendor</TableHeaderCell>
                    <TableHeaderCell>Expenses</TableHeaderCell>
                    <TableHeaderCell>Total</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow key={v.vendorName}>
                      <TableCell className="font-medium">{v.vendorName}</TableCell>
                      <TableCell>{v.expenseCount}</TableCell>
                      <TableCell>{formatInr(v.totalInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
