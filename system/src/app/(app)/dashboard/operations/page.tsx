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
import { formatPercent, formatInr } from "@/lib/utils";
import { trailingRange, daysBetween, round2, type DateRange } from "@/server/domain/analytics/shared";
import {
  getAvgTurnaroundMinutes,
  getDelaySummary,
  getTripUtilizationTrend,
  getBoatUtilization,
  getCrewEfficiency,
  getFuelBurnTrend,
  getEngineHoursAccumulation,
  getDowntimeByVessel,
  getTrueAssetYield,
  type FuelBurnEntry,
} from "@/server/domain/analytics/operations";
import { DateRangePicker } from "../_components/date-range-picker";
import { UtilizationTrendChart, FuelBurnTrendChart, type UtilizationPoint, type FuelBurnPoint } from "../_components/charts";
import { getVesselNames } from "../_lib/names";
import { formatRangeLabel } from "../_lib/season";

const ON_TIME_ALERT_THRESHOLD_PCT = 70;
const LOW_UTILIZATION_ALERT_THRESHOLD_PCT = 60;

function parseRange(sp: { from?: string; to?: string }): DateRange {
  if (sp.from && sp.to) return { from: sp.from, to: sp.to };
  return trailingRange(90);
}

function formatSignedMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  const sign = minutes > 0 ? "+" : minutes < 0 ? "" : "";
  return `${sign}${minutes.toFixed(1)} min`;
}

function aggregateFuelByDay(entries: FuelBurnEntry[]): FuelBurnPoint[] {
  const map = new Map<string, FuelBurnPoint>();
  for (const e of entries) {
    const cur = map.get(e.tripDate) ?? { date: e.tripDate, costInr: 0, litersConsumed: 0 };
    cur.costInr += e.costInr;
    cur.litersConsumed += e.litersConsumed;
    map.set(e.tripDate, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export default async function OperationsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const rangeDays = daysBetween(range.from, range.to) + 1;

  const avgTurnaroundMinutes = getAvgTurnaroundMinutes(undefined, range);
  const delaySummary = getDelaySummary(undefined, range);
  const utilizationTrend = getTripUtilizationTrend(undefined, range);
  const boatUtilization = getBoatUtilization(undefined, range);
  const crewEfficiency = getCrewEfficiency(undefined, range)
    .filter((c) => c.tripsCrewed > 0)
    .sort((a, b) => b.tripsCrewed - a.tripsCrewed);
  const fuelBurnEntries = getFuelBurnTrend(undefined, range);
  const engineHours = getEngineHoursAccumulation(undefined, range);
  const downtime = getDowntimeByVessel(undefined, range);

  const vesselNames = getVesselNames();

  const utilizationPoints: UtilizationPoint[] = utilizationTrend.map((u) => ({
    date: u.date,
    occupancyPct: u.occupancyPct,
    passengers: u.passengers,
    capacity: u.capacity,
  }));

  const avgOccupancyPct =
    utilizationTrend.length > 0
      ? round2(utilizationTrend.reduce((sum, u) => sum + u.occupancyPct, 0) / utilizationTrend.length)
      : null;

  const fuelBurnPoints = aggregateFuelByDay(fuelBurnEntries);
  const totalFuelCostInr = fuelBurnEntries.reduce((sum, e) => sum + e.costInr, 0);
  const totalEngineHours = round2(engineHours.reduce((sum, e) => sum + e.totalEngineHours, 0));
  const totalDowntimeHours = round2(downtime.reduce((sum, d) => sum + d.downtimeHours, 0));
  const trueAssetYields = getTrueAssetYield(undefined, range);

  const entriesWithNm = fuelBurnEntries.filter(e => e.litersPerNm !== null);
  const avgLitersPerNm = entriesWithNm.length > 0
    ? round2(entriesWithNm.reduce((sum, e) => sum + e.litersPerNm!, 0) / entriesWithNm.length)
    : null;

  const lowUtilizationVessels = boatUtilization.filter(
    (v) => v.tripsScheduled > 0 && v.utilizationPct < LOW_UTILIZATION_ALERT_THRESHOLD_PCT
  );
  const downtimeAlertThresholdHours = rangeDays * 0.5; // heuristic: >30 min/day average flagged
  const highDowntimeVessels = downtime.filter((d) => d.downtimeHours > downtimeAlertThresholdHours);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Operations Intelligence</h1>
          <p className="mt-1 text-[13px] text-foreground-muted">{formatRangeLabel(range)}</p>
        </div>
        <DateRangePicker from={range.from} to={range.to} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Avg Turnaround" value={avgTurnaroundMinutes !== null ? `${avgTurnaroundMinutes.toFixed(1)} min` : "—"} />
        <StatTile label="On-Time Departures" value={delaySummary.onTimeDeparturePct !== null ? formatPercent(delaySummary.onTimeDeparturePct) : "—"} />
        <StatTile label="Avg Occupancy" value={avgOccupancyPct !== null ? formatPercent(avgOccupancyPct) : "—"} />
        <StatTile label="Engine Hours" value={`${totalEngineHours.toFixed(1)} hrs`} />
        <StatTile label="Downtime" value={`${totalDowntimeHours.toFixed(1)} hrs`} />
      </div>

      {/* --- Turnaround & Delays --- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Turnaround &amp; Delays</CardTitle>
            <CardDescription>Gap between consecutive trips per vessel, and scheduled vs. actual departure/return times.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {delaySummary.onTimeDeparturePct !== null && delaySummary.onTimeDeparturePct < ON_TIME_ALERT_THRESHOLD_PCT && (
            <Callout tone="warning" title="Departure delays are elevated">
              Only {formatPercent(delaySummary.onTimeDeparturePct)} of departures were within 10 minutes of schedule
              across {delaySummary.tripsAnalyzed} trips this period — average departure delay was{" "}
              {formatSignedMinutes(delaySummary.avgDepartureDelayMinutes)}. Boarding or crew-readiness bottlenecks are
              worth investigating, since chronic delays compress turnaround and reduce trips-per-day capacity.
            </Callout>
          )}
          {delaySummary.tripsAnalyzed === 0 ? (
            <EmptyState icon={<Inbox size={28} />} title="No timed trips in this range" description="No trips with recorded actual departure times were found." />
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Avg Departure Delay" value={formatSignedMinutes(delaySummary.avgDepartureDelayMinutes)} />
              <StatTile label="Avg Return Delay" value={formatSignedMinutes(delaySummary.avgReturnDelayMinutes)} />
              <StatTile label="On-Time Departures" value={formatPercent(delaySummary.onTimeDeparturePct ?? 0)} />
              <StatTile label="Trips Analyzed" value={String(delaySummary.tripsAnalyzed)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Utilization --- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Utilization</CardTitle>
            <CardDescription>Daily occupancy trend across all trips, and per-vessel trip utilization.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {lowUtilizationVessels.length > 0 && (
            <Callout tone="warning" title="Low vessel utilization">
              {lowUtilizationVessels
                .map((v) => `${vesselNames[v.vesselId] ?? v.vesselId} ran ${formatPercent(v.utilizationPct)} of scheduled trips`)
                .join("; ")}{" "}
              this period — below the {LOW_UTILIZATION_ALERT_THRESHOLD_PCT}% watch threshold. Worth checking whether
              this is planned maintenance downtime, cancellations, or a scheduling/demand mismatch.
            </Callout>
          )}
          {utilizationPoints.length === 0 ? (
            <EmptyState icon={<Inbox size={28} />} title="No trips in this range" />
          ) : (
            <UtilizationTrendChart data={utilizationPoints} />
          )}
          {boatUtilization.length === 0 ? (
            <EmptyState icon={<Inbox size={24} />} title="No vessel utilization data" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Vessel</TableHeaderCell>
                  <TableHeaderCell>Trips Run</TableHeaderCell>
                  <TableHeaderCell>Trips Scheduled</TableHeaderCell>
                  <TableHeaderCell>Utilization</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {boatUtilization.map((v) => (
                  <TableRow key={v.vesselId}>
                    <TableCell className="font-medium">{vesselNames[v.vesselId] ?? v.vesselId}</TableCell>
                    <TableCell>{v.tripsRun}</TableCell>
                    <TableCell>{v.tripsScheduled}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {formatPercent(v.utilizationPct)}
                        {v.tripsScheduled > 0 && v.utilizationPct < LOW_UTILIZATION_ALERT_THRESHOLD_PCT && (
                          <Badge tone="warning">Low</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* --- Fuel & Engine --- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fuel &amp; Engine</CardTitle>
            <CardDescription>Daily fuel cost trend, engine-hour accumulation, and maintenance downtime by vessel.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {highDowntimeVessels.length > 0 && (
            <Callout tone="warning" title="Above-average downtime">
              {highDowntimeVessels
                .map((d) => `${vesselNames[d.vesselId] ?? d.vesselId} logged ${d.downtimeHours.toFixed(1)} hrs of downtime across ${d.recordCount} maintenance record(s)`)
                .join("; ")}{" "}
              in this {rangeDays}-day period — notably higher than the ~{downtimeAlertThresholdHours.toFixed(0)} hr
              watch threshold for this window. This directly eats into available trip capacity.
            </Callout>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {fuelBurnPoints.length === 0 ? (
                <EmptyState icon={<Inbox size={28} />} title="No fuel logs in this range" />
              ) : (
                <FuelBurnTrendChart data={fuelBurnPoints} />
              )}
              {fuelBurnPoints.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-[12px] text-foreground-muted">
                  <span>Total fuel cost: {formatInr(totalFuelCostInr)}</span>
                  {avgLitersPerNm !== null && <span>Avg fuel burn: {avgLitersPerNm} L/NM</span>}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground-muted">Engine Hours by Vessel</p>
                {engineHours.length === 0 ? (
                  <EmptyState icon={<Inbox size={20} />} title="No engine hours logged" />
                ) : (
                  <div className="space-y-2">
                    {engineHours.map((e) => (
                      <div key={e.vesselId} className="flex items-center justify-between text-[13px]">
                        <span className="text-foreground-muted">{vesselNames[e.vesselId] ?? e.vesselId}</span>
                        <span className="font-medium text-foreground">{e.totalEngineHours.toFixed(1)} hrs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground-muted">Downtime by Vessel</p>
                {downtime.length === 0 ? (
                  <EmptyState icon={<Inbox size={20} />} title="No downtime recorded" />
                ) : (
                  <div className="space-y-2">
                    {downtime.map((d) => (
                      <div key={d.vesselId} className="flex items-center justify-between text-[13px]">
                        <span className="text-foreground-muted">{vesselNames[d.vesselId] ?? d.vesselId}</span>
                        <span className="font-medium text-foreground">
                          {d.downtimeHours.toFixed(1)} hrs
                          <span className="ml-1 text-foreground-faint">({d.recordCount})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- True Asset Yield --- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>True Asset Yield</CardTitle>
            <CardDescription>Actual Profit net of Opportunity Cost from downtime.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {trueAssetYields.length === 0 ? (
            <EmptyState icon={<Inbox size={24} />} title="No data in this range" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Vessel</TableHeaderCell>
                  <TableHeaderCell className="text-right">Profit</TableHeaderCell>
                  <TableHeaderCell className="text-right">Downtime</TableHeaderCell>
                  <TableHeaderCell className="text-right">Opportunity Cost</TableHeaderCell>
                  <TableHeaderCell className="text-right">True Asset Yield</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trueAssetYields.map((t) => (
                  <TableRow key={t.vesselId}>
                    <TableCell className="font-medium">{vesselNames[t.vesselId] ?? t.vesselId}</TableCell>
                    <TableCell className="text-right">{formatInr(t.actualProfitInr)}</TableCell>
                    <TableCell className="text-right">{t.downtimeHours.toFixed(1)} hrs</TableCell>
                    <TableCell className="text-right text-danger">{formatInr(t.opportunityCostInr)}</TableCell>
                    <TableCell className="text-right font-medium text-success">{formatInr(t.trueAssetYieldInr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* --- Crew --- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Crew Efficiency</CardTitle>
            <CardDescription>Trips crewed in the period, and average guest rating for captains.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {crewEfficiency.length === 0 ? (
            <EmptyState icon={<Inbox size={28} />} title="No crew assignments in this range" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Crew Member</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                  <TableHeaderCell>Trips Crewed</TableHeaderCell>
                  <TableHeaderCell>Avg Captain Rating</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {crewEfficiency.map((c) => (
                  <TableRow key={c.crewId}>
                    <TableCell className="font-medium">{c.fullName}</TableCell>
                    <TableCell className="capitalize">{c.role.replace("_", " ")}</TableCell>
                    <TableCell>{c.tripsCrewed}</TableCell>
                    <TableCell>{c.avgCaptainRating !== null ? `${c.avgCaptainRating.toFixed(1)} / 10` : "—"}</TableCell>
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
