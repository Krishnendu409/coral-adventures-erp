import { Compass, Ship, Briefcase } from "lucide-react";
import { getDb } from "@/server/db/client";
import { trailingRange } from "@/server/domain/analytics/shared";
import { getSeasonalityMetrics, getFleetExpansionROI } from "@/server/domain/analytics/expansion";
import { getEventProfitability } from "@/server/domain/analytics/events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatTile, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Badge } from "@/components/ui";
import { formatInr, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function ExpansionDashboardPage() {
  const db = getDb();
  // Seasonality uses a full year range to be meaningful
  const range = trailingRange(365);
  
  const seasonality = getSeasonalityMetrics(db, range);
  const newFleetRoi = getFleetExpansionROI(db);
  const eventProfitability = getEventProfitability(db, range);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expansion & Events</h1>
        <p className="text-[13.5px] text-foreground-muted">
          Seasonality trends, Fleet Expansion ROI, and Corporate Event Profitability (Trailing 365 days).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><Compass size={18} /> Seasonality Revenue vs. Opex</CardTitle>
              <CardDescription>Profitability segmented by peak, shoulder, and offseason</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Season</TableHeaderCell>
                  <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                  <TableHeaderCell className="text-right">Var. Cost</TableHeaderCell>
                  <TableHeaderCell className="text-right">Allocated Fixed</TableHeaderCell>
                  <TableHeaderCell className="text-right">Profit</TableHeaderCell>
                  <TableHeaderCell className="text-right">Margin</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {seasonality.map((s) => (
                  <TableRow key={s.season}>
                    <TableCell className="font-medium capitalize">{s.season}</TableCell>
                    <TableCell className="text-right">{formatInr(s.revenueInr)}</TableCell>
                    <TableCell className="text-right text-foreground-muted">{formatInr(s.variableCostInr)}</TableCell>
                    <TableCell className="text-right text-foreground-muted">{formatInr(s.fixedCostAllocationInr)}</TableCell>
                    <TableCell className="text-right font-medium">{formatInr(s.profitInr)}</TableCell>
                    <TableCell className="text-right">{s.marginPct !== null ? formatPercent(s.marginPct) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><Ship size={18} /> Fleet Expansion ROI</CardTitle>
              <CardDescription>Projected performance of acquiring an additional vessel</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">New Vessel Cost</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{formatInr(newFleetRoi.newVesselCostInr)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Assumed Capacity</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{newFleetRoi.newVesselCapacity} pax</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Projected Annual Profit</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{formatInr(newFleetRoi.projectedAnnualProfitInr)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground-muted">Payback Period</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {newFleetRoi.paybackPeriodYears !== null ? `${newFleetRoi.paybackPeriodYears} years` : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[12px] font-medium text-foreground-muted">Projected ROI</div>
              <div className="mt-1 text-xl font-bold text-success">
                {newFleetRoi.roiPct !== null ? formatPercent(newFleetRoi.roiPct) : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><Briefcase size={18} /> Event Intelligence</CardTitle>
            <CardDescription>Corporate Event Profitability vs. Standard Trip</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Trip Type</TableHeaderCell>
                <TableHeaderCell className="text-right">Total Trips</TableHeaderCell>
                <TableHeaderCell className="text-right">Total Revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">Total Var. Cost</TableHeaderCell>
                <TableHeaderCell className="text-right">Avg Profit / Trip</TableHeaderCell>
                <TableHeaderCell className="text-right">Avg Margin</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {eventProfitability.map((e) => (
                <TableRow key={e.type}>
                  <TableCell className="font-medium">
                    {e.type}
                    {e.type === 'Corporate Event' && <Badge tone="brand" className="ml-2">High Value</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{e.tripCount}</TableCell>
                  <TableCell className="text-right">{formatInr(e.totalRevenueInr)}</TableCell>
                  <TableCell className="text-right">{formatInr(e.totalVariableCostInr)}</TableCell>
                  <TableCell className="text-right font-medium text-success">{e.avgProfitPerTripInr !== null ? formatInr(e.avgProfitPerTripInr) : "—"}</TableCell>
                  <TableCell className="text-right">{e.avgMarginPct !== null ? formatPercent(e.avgMarginPct) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
