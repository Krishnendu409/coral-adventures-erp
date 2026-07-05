import Link from "next/link";
import { Users, Crown, Repeat, Share2, Star } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatTile,
  EmptyState,
  Badge,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import { cn, formatInr, formatPercent } from "@/lib/utils";
import {
  getAverageLtv,
  getCustomerLtvTable,
  segmentCustomers,
  detectVips,
  getRepeatCustomerStats,
  getTopReferrers,
  getFeedbackTrend,
  getCancellationBehavior,
  getBookingVelocity,
  type Segment,
} from "@/server/domain/analytics/customer";
import { todayStr, trailingRange } from "@/server/domain/analytics/shared";
import { NpsTrendChart } from "./nps-trend-chart";

export const dynamic = "force-dynamic";

const SEGMENT_ORDER: Segment[] = ["VIP", "Loyal", "Regular", "New", "At Risk", "Lapsed"];

const SEGMENT_TONE: Record<Segment, "brand" | "success" | "neutral" | "info" | "warning" | "danger"> = {
  VIP: "brand",
  Loyal: "success",
  Regular: "neutral",
  New: "info",
  "At Risk": "warning",
  Lapsed: "danger",
};

const SEGMENT_BAR_CLASS: Record<Segment, string> = {
  VIP: "bg-ocean-500",
  Loyal: "bg-success",
  Regular: "bg-neutral-400",
  New: "bg-info",
  "At Risk": "bg-warning",
  Lapsed: "bg-danger",
};

export default function CustomerIntelligencePage() {
  const asOf = todayStr();

  const avgLtv = getAverageLtv();
  const repeatStats = getRepeatCustomerStats();
  const ltvTable = getCustomerLtvTable();
  const segments = segmentCustomers(undefined, asOf);
  const vips = detectVips(undefined, 10);
  const topReferrers = getTopReferrers(undefined, 8);
  const feedbackTrend = getFeedbackTrend(undefined, trailingRange(270, asOf));
  
  const cancelMetrics = getCancellationBehavior(undefined, trailingRange(90, asOf));
  const velocityStats = getBookingVelocity(undefined, trailingRange(90, asOf));

  const topByLtv = [...ltvTable]
    .filter((c) => c.totalSpendInr > 0)
    .sort((a, b) => b.totalSpendInr - a.totalSpendInr)
    .slice(0, 15);

  const segmentCounts = SEGMENT_ORDER.map((segment) => ({
    segment,
    count: segments.filter((s) => s.segment === segment).length,
  }));
  const totalSegmented = segments.length || 1;

  const npsTrendData = feedbackTrend.map((b) => ({
    month: b.month,
    npsScore: b.nps.score,
    avgOverall: b.avgOverall,
    responses: b.responses,
  }));
  const latestBucket = feedbackTrend[feedbackTrend.length - 1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Customer Intelligence</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Lifetime value, segmentation, VIPs, referrals and feedback trends — computed live from bookings, payments
          and feedback.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Avg. LTV (all customers)"
          value={formatInr(avgLtv.avgLtvAllCustomersInr)}
          icon={<Users size={16} />}
        />
        <StatTile
          label="Avg. LTV (paying customers)"
          value={avgLtv.avgLtvPayingCustomersInr == null ? "—" : formatInr(avgLtv.avgLtvPayingCustomersInr)}
          icon={<Star size={16} />}
        />
        <StatTile
          label="Repeat customers"
          value={`${repeatStats.repeatCustomers} / ${repeatStats.totalCustomers}`}
          delta={repeatStats.repeatRatePct ?? undefined}
          deltaLabel="repeat rate"
          icon={<Repeat size={16} />}
        />
        <StatTile
          label="Top referrers tracked"
          value={String(topReferrers.length)}
          icon={<Share2 size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div>
              <CardTitle>Customer Segments</CardTitle>
              <CardDescription>RFM-lite segmentation as of {asOf}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {segmentCounts.map(({ segment, count }) => {
              const widthPct = Math.max(2, Math.round((count / totalSegmented) * 100));
              return (
                <div key={segment}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={SEGMENT_TONE[segment]}>{segment}</Badge>
                    </div>
                    <span className="text-foreground-muted">
                      {count} <span className="text-foreground-faint">({formatPercent((count / totalSegmented) * 100)})</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className={cn("h-full rounded-full", SEGMENT_BAR_CLASS[segment])} style={{ width: `${widthPct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Feedback &amp; NPS Trend</CardTitle>
              <CardDescription>Monthly Net Promoter Score, trailing 9 months</CardDescription>
            </div>
            {latestBucket && (
              <div className="text-right">
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {latestBucket.nps.score == null ? "—" : latestBucket.nps.score.toFixed(0)}
                </p>
                <p className="text-[12px] text-foreground-faint">latest month NPS</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {npsTrendData.length === 0 ? (
              <EmptyState title="No feedback submitted yet" description="NPS trend will appear once feedback workbooks are imported." />
            ) : (
              <NpsTrendChart data={npsTrendData} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Lifetime Value — Top Customers</CardTitle>
            <CardDescription>Top 15 customers by all-time net spend</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {topByLtv.length === 0 ? (
            <EmptyState title="No paying customers yet" description="LTV rankings will appear once payments are recorded." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell>Completed bookings</TableHeaderCell>
                  <TableHeaderCell>First trip</TableHeaderCell>
                  <TableHeaderCell>Last booking</TableHeaderCell>
                  <TableHeaderCell className="text-right">Lifetime spend</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topByLtv.map((c) => (
                  <TableRow key={c.customerId}>
                    <TableCell>
                      <Link href={`/customers/${c.customerId}`} className="font-medium text-ocean-700 hover:underline dark:text-ocean-300">
                        {c.fullName}
                      </Link>
                      <div className="text-[12px] text-foreground-faint">{c.customerId}</div>
                    </TableCell>
                    <TableCell>{c.completedBookings}</TableCell>
                    <TableCell>{c.firstTripDate ?? "—"}</TableCell>
                    <TableCell>{c.lastBookingDate ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatInr(c.totalSpendInr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cancellation & No-show Behavior</CardTitle>
              <CardDescription>Trailing 90 days of cancellation timing and rates</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Cancellation Rate" value={cancelMetrics.cancellationRatePct !== null ? formatPercent(cancelMetrics.cancellationRatePct) : "—"} />
              <StatTile label="No-show Rate" value={cancelMetrics.noShowRatePct !== null ? formatPercent(cancelMetrics.noShowRatePct) : "—"} />
              <StatTile label="Cancelled Bookings" value={String(cancelMetrics.cancelled)} />
              <StatTile label="Refunds Issued" value={formatInr(cancelMetrics.refundAmountsInr)} />
            </div>
            {Object.keys(cancelMetrics.byDaysBeforeDeparture).length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-[13px] font-medium text-foreground-muted">Cancellation Lead Time (days before trip)</p>
                <div className="space-y-2">
                  {Object.entries(cancelMetrics.byDaysBeforeDeparture)
                    .filter(([_, count]) => count > 0)
                    .map(([bracket, count]) => (
                    <div key={bracket} className="flex items-center justify-between text-[13px]">
                      <span className="text-foreground">{bracket}</span>
                      <span className="font-medium">{count} bookings</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Booking Velocity</CardTitle>
              <CardDescription>Average booking lead time and volume (trailing 90 days)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Avg Booking Lead Time" value={velocityStats.avgLeadTimeDays !== null ? `${velocityStats.avgLeadTimeDays} days` : "—"} />
              <StatTile label="Bookings / Day" value={velocityStats.avgBookingsPerDay !== null ? String(velocityStats.avgBookingsPerDay) : "—"} />
            </div>
            {Object.keys(velocityStats.byChannelLeadTime).length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-[13px] font-medium text-foreground-muted">Lead Time by Channel</p>
                <div className="space-y-2">
                  {Object.entries(velocityStats.byChannelLeadTime)
                    .sort((a, b) => b[1] - a[1])
                    .map(([channel, leadTime]) => (
                    <div key={channel} className="flex items-center justify-between text-[13px]">
                      <span className="text-foreground">{channel}</span>
                      <span className="font-medium">{leadTime} days</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Crown size={15} className="text-gold-600" /> VIP Customers
              </CardTitle>
              <CardDescription>Top 10% of paying customers by lifetime spend</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {vips.length === 0 ? (
              <EmptyState title="No VIPs yet" description="VIPs are detected from paying customers once bookings exist." />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {vips.slice(0, 10).map((c) => (
                  <li key={c.customerId} className="flex items-center justify-between py-2.5 text-[13.5px]">
                    <div>
                      <Link href={`/customers/${c.customerId}`} className="font-medium text-foreground hover:text-ocean-700 hover:underline dark:hover:text-ocean-300">
                        {c.fullName}
                      </Link>
                      <div className="text-[12px] text-foreground-faint">{c.completedBookings} completed bookings</div>
                    </div>
                    <span className="font-medium text-foreground">{formatInr(c.totalSpendInr)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Referrers</CardTitle>
              <CardDescription>Customers who bring in the most direct referrals</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <EmptyState title="No referrals recorded" description="Referral leaderboard appears once customers refer others." />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {topReferrers.map((r) => (
                  <li key={r.customerId} className="flex items-center justify-between py-2.5 text-[13.5px]">
                    <Link href={`/customers/${r.customerId}`} className="font-medium text-foreground hover:text-ocean-700 hover:underline dark:hover:text-ocean-300">
                      {r.fullName}
                    </Link>
                    <Badge tone="brand">{r.directReferrals} referrals</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
