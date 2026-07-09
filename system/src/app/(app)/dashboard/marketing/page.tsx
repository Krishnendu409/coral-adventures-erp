import { Megaphone } from "lucide-react";
import { getDb } from "@/server/db/client";
import {
  getActiveChannels,
  computeCac,
  computeLtv,
  computeRoi,
  computeReferralRate,
  getBookingFunnel,
  getChannelAttribution,
  getBreakEvenAnalysis,
  getCampaignComparison,
} from "@/server/domain/analytics/marketing";
import { trailingRange, todayStr } from "@/server/domain/analytics/shared";
import { Badge, Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, StatTile } from "@/components/ui";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { cn, formatCompactNumber, formatInr, formatPercent } from "@/lib/utils";
import { MarketingTabs } from "./_components/marketing-tabs";
import { RankedBarChart, StageBarChart } from "./_components/charts";

export const dynamic = "force-dynamic";

function pctOrDash(v: number | null, digits = 1) {
  return v === null ? "—" : formatPercent(v, digits);
}
function inrOrDash(v: number | null) {
  return v === null ? "—" : formatInr(v);
}

export default function MarketingOverviewPage() {
  const db = getDb();
  const range = trailingRange(90);
  const asOf = todayStr();

  const channels = getActiveChannels(db);

  // Descriptive (non-KPI) columns not exposed by the domain layer's
  // MarketingChannel type — read directly since these are raw facts
  // (analyst-authored recommendation text), not derived calculations.
  const narrativeRows = db
    .prepare(`SELECT channel_id, priority, risk_level, recommendation FROM marketing_channels WHERE is_active = 1`)
    .all() as { channel_id: string; priority: number | null; risk_level: string | null; recommendation: string | null }[];
  const narrativeByChannel = new Map(narrativeRows.map((r) => [r.channel_id, r]));

  const channelMetrics = channels.map((channel) => {
    const cac = computeCac(db, channel.channelId, range);
    const ltv = computeLtv(db, channel.channelId);
    const roi = computeRoi(db, channel.channelId, range);
    const referral = computeReferralRate(db, channel.channelId);
    return { channel, cac, ltv, roi, referral, narrative: narrativeByChannel.get(channel.channelId) };
  });

  const ranked = [...channelMetrics]
    .filter((m) => m.roi.roiPct !== null)
    .sort((a, b) => (b.roi.roiPct ?? -Infinity) - (a.roi.roiPct ?? -Infinity));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  const funnel = getBookingFunnel(db, range);
  const funnelStages = [
    { label: "New", value: funnel.byStatus["new"] ?? 0 },
    { label: "Contacted", value: funnel.byStatus["contacted"] ?? 0 },
    { label: "Qualified", value: funnel.byStatus["qualified"] ?? 0 },
    { label: "Converted", value: funnel.byStatus["converted"] ?? 0 },
  ];
  const lostLeads = funnel.byStatus["lost"] ?? 0;

  const attribution = getChannelAttribution(db, range)
    .filter((a) => a.channelId !== null)
    .sort((a, b) => b.revenueInr - a.revenueInr);
  const attributionByChannel = new Map(channels.map((c) => [c.channelId, c.name]));
  const topAttribution = attribution.slice(0, 12);

  const breakEven = getBreakEvenAnalysis(db, asOf);
  const campaigns = getCampaignComparison(db, range).sort((a, b) => b.revenueGeneratedInr - a.revenueGeneratedInr);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketing Intelligence</h1>
        <p className="text-[13.5px] text-foreground-muted">
          Channel performance, booking funnel, and campaign ROI over the trailing 90 days ({range.from} to {range.to}).
        </p>
      </div>

      <MarketingTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Leads captured (90d)" value={formatCompactNumber(funnel.totalLeads)} />
        <StatTile
          label="Lead → booking conversion"
          value={pctOrDash(funnel.conversionRatePct)}
          deltaLabel="of captured leads"
        />
        <StatTile label="Active channels" value={String(channels.length)} />
        <StatTile
          label="Break-even occupancy"
          value={pctOrDash(breakEven.breakEvenOccupancyPct)}
          deltaLabel={breakEven.basis === "actual_trailing_90d" ? "trailing 90d actuals" : "assumption-based"}
        />
      </div>

      {(best || worst) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {best && (
            <Callout tone="success" title={`Best performer: ${best.channel.name}`}>
              <div className="space-y-1">
                <p>
                  {formatPercent(best.roi.roiPct as number)} projected ROI over the last 90 days — the strongest claim on
                  the next rupee of marketing spend right now.
                </p>
                {best.narrative?.recommendation && (
                  <p className="text-[12.5px] opacity-80">{best.narrative.recommendation}</p>
                )}
              </div>
            </Callout>
          )}
          {worst && worst !== best && (
            <Callout tone="warning" title={`Weakest performer: ${worst.channel.name}`}>
              <div className="space-y-1">
                <p>
                  {formatPercent(worst.roi.roiPct as number)} projected ROI over the last 90 days — reassess spend or
                  targeting before the next budget cycle.
                </p>
                {worst.narrative?.recommendation && (
                  <p className="text-[12.5px] opacity-80">{worst.narrative.recommendation}</p>
                )}
              </div>
            </Callout>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Channel performance</CardTitle>
            <CardDescription>CAC, LTV, and ROI per active channel, ranked by projected ROI (trailing 90 days).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Channel</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell className="text-right">CAC</TableHeaderCell>
                <TableHeaderCell className="text-right">LTV / paying customer</TableHeaderCell>
                <TableHeaderCell className="text-right">ROI (90d)</TableHeaderCell>
                <TableHeaderCell className="text-right">Referrals / customer</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channelMetrics
                .sort((a, b) => (b.roi.roiPct ?? -Infinity) - (a.roi.roiPct ?? -Infinity))
                .map((m) => (
                  <TableRow key={m.channel.channelId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {m.channel.name}
                        {m === best && <Badge tone="success">Best</Badge>}
                        {m === worst && <Badge tone="warning">Weakest</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground-muted">{m.channel.category}</TableCell>
                    <TableCell className="text-right tabular-nums">{inrOrDash(m.cac.cacInr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inrOrDash(m.ltv.ltvPerPayingCustomerInr)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        m.roi.roiPct !== null && m.roi.roiPct > 0 && "text-success",
                        m.roi.roiPct !== null && m.roi.roiPct < 0 && "text-danger"
                      )}
                    >
                      {pctOrDash(m.roi.roiPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.referral.actualReferralsPerCustomer ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Booking funnel</CardTitle>
              <CardDescription>Leads by stage, trailing 90 days.</CardDescription>
            </div>
            {lostLeads > 0 && <Badge tone="danger">{formatCompactNumber(lostLeads)} lost</Badge>}
          </CardHeader>
          <CardContent className="pt-4">
            {funnel.totalLeads === 0 ? (
              <EmptyState
                icon={<Megaphone size={28} />}
                title="No leads in this window"
                description="No leads were captured in the trailing 90 days."
              />
            ) : (
              <StageBarChart data={funnelStages} formatType="compact" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Break-even analysis</CardTitle>
              <CardDescription>
                Basis: {breakEven.basis === "actual_trailing_90d" ? "actual trailing-90d bookings" : "assumption-based (no trip history yet)"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Annual fixed costs</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{formatInr(breakEven.annualFixedCostsInr)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Contribution margin / booking</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {formatInr(breakEven.contributionMarginPerBookingInr)}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Break-even bookings / year</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {breakEven.breakEvenBookingsPerYear !== null ? formatCompactNumber(breakEven.breakEvenBookingsPerYear) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Break-even occupancy</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{pctOrDash(breakEven.breakEvenOccupancyPct)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Revenue attribution by channel</CardTitle>
            <CardDescription>Top 12 channels by booking revenue attributed via bookings.channel_id, trailing 90 days.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {topAttribution.length === 0 ? (
            <EmptyState title="No attributed bookings" description="No bookings with completed payments fell in this window." />
          ) : (
            <RankedBarChart
              data={topAttribution.map((a) => ({
                label: attributionByChannel.get(a.channelId as string) ?? (a.channelId as string),
                value: a.revenueInr,
              }))}
              formatType="inr"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Campaign comparison</CardTitle>
            <CardDescription>Campaigns started in the trailing 90 days, ranked by revenue generated.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns in this window" description="No campaigns started in the trailing 90 days." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Campaign</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Budget</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actual spend</TableHeaderCell>
                  <TableHeaderCell className="text-right">Bookings</TableHeaderCell>
                  <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge tone={c.status === "completed" ? "success" : c.status === "active" ? "info" : "neutral"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(c.budgetInr)}</TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", c.budgetVarianceInr > 0 ? "text-danger" : "text-foreground-muted")}
                    >
                      {formatInr(c.actualSpendInr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.bookingsGenerated}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatInr(c.revenueGeneratedInr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
