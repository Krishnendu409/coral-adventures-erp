import { AlertTriangle, Clock, Gauge, Ship, Wrench } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatTile,
  EmptyState,
  Badge,
  Callout,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import { cn, formatInr } from "@/lib/utils";
import {
  getUpcomingAndOverdueMaintenance,
  getFailureFrequencyByComponent,
  getDowntimeCost,
  getBoatHealthScore,
} from "@/server/domain/analytics/maintenance";
import { todayStr, trailingRange } from "@/server/domain/analytics/shared";
import { getDb } from "@/server/db/client";
import { FailureFrequencyChart } from "./failure-frequency-chart";

export const dynamic = "force-dynamic";

function healthTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

const healthBarClass: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const healthTextClass: Record<"success" | "warning" | "danger", string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export default function MaintenanceIntelligencePage() {
  const asOf = todayStr();
  const range = trailingRange(365, asOf);

  const vessels = getDb().prepare(`SELECT vessel_id, name, status FROM vessels ORDER BY name`).all() as {
    vessel_id: string;
    name: string;
    status: string;
  }[];

  const alerts = getUpcomingAndOverdueMaintenance(undefined, asOf);
  const overdue = alerts.filter((a) => a.daysUntilDue != null && a.daysUntilDue < 0);
  const upcoming = alerts.filter((a) => a.daysUntilDue != null && a.daysUntilDue >= 0);
  const noDueDate = alerts.filter((a) => a.daysUntilDue == null);

  const failureFrequency = getFailureFrequencyByComponent(undefined, range);
  const downtimeCost = getDowntimeCost(undefined, asOf, range);
  const healthScores = vessels.map((v) => ({ vessel: v, health: getBoatHealthScore(undefined, v.vessel_id, asOf) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Maintenance Intelligence</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Upcoming &amp; overdue service, failure frequency, downtime cost and fleet health — computed live from
          maintenance records.
        </p>
      </div>

      {overdue.length > 0 && (
        <Callout tone="danger" title={`${overdue.length} maintenance item${overdue.length === 1 ? "" : "s"} overdue`}>
          Safety-relevant components are past their due date. Review the list below and schedule service immediately.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Overdue items" value={String(overdue.length)} icon={<AlertTriangle size={16} />} />
        <StatTile label="Upcoming (14 days)" value={String(upcoming.length)} icon={<Clock size={16} />} />
        <StatTile
          label="Downtime (trailing 365d)"
          value={`${downtimeCost.totalDowntimeHours.toFixed(0)} hrs`}
          icon={<Wrench size={16} />}
        />
        <StatTile
          label="Est. downtime cost"
          value={formatInr(downtimeCost.estimatedTotalCostInr)}
          deltaLabel={downtimeCost.costPerHourBasis === "actual_trailing_90d_revenue" ? "based on actual revenue" : "based on assumptions"}
          icon={<Gauge size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {healthScores.map(({ vessel, health }) => {
          const tone = healthTone(health.score);
          return (
            <Card key={vessel.vessel_id}>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-1.5">
                    <Ship size={15} /> {vessel.name}
                  </CardTitle>
                  <CardDescription>Boat Health Score</CardDescription>
                </div>
                <Badge tone={tone}>{vessel.status}</Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <span className={cn("text-4xl font-semibold tracking-tight", healthTextClass[tone])}>
                    {health.score.toFixed(0)}
                  </span>
                  <span className="mb-1 text-[13px] text-foreground-faint">/ 100</span>
                </div>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="mb-1 flex justify-between text-[12px] text-foreground-muted">
                      <span>Downtime (90d)</span>
                      <span>{health.downtimeHoursTrailing90d.toFixed(1)} hrs</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className={cn("h-full rounded-full", healthBarClass[tone])} style={{ width: `${health.components.downtimeScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[12px] text-foreground-muted">
                      <span>Frequency (90d)</span>
                      <span>{health.maintenanceRecordsTrailing90d} records</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className={cn("h-full rounded-full", healthBarClass[tone])} style={{ width: `${health.components.frequencyScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[12px] text-foreground-muted">
                      <span>Recency</span>
                      <span>{health.daysSinceLastService == null ? "unknown" : `${health.daysSinceLastService}d ago`}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className={cn("h-full rounded-full", healthBarClass[tone])} style={{ width: `${health.components.recencyScore}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upcoming &amp; Overdue Maintenance</CardTitle>
            <CardDescription>Next 14 days, plus anything still open past its due date</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <EmptyState title="No maintenance due" description="Nothing is overdue or due within the next 14 days." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Component</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Next due</TableHeaderCell>
                  <TableHeaderCell className="text-right">Days until due</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...overdue, ...upcoming, ...noDueDate].map((a) => (
                  <TableRow key={a.maintenanceId}>
                    <TableCell className="font-medium">{a.component}</TableCell>
                    <TableCell className="capitalize">{a.type}</TableCell>
                    <TableCell className="capitalize">{a.status.replace("_", " ")}</TableCell>
                    <TableCell>{a.nextDueDate ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {a.daysUntilDue == null ? (
                        "—"
                      ) : a.daysUntilDue < 0 ? (
                        <Badge tone="danger">{Math.abs(a.daysUntilDue)}d overdue</Badge>
                      ) : (
                        <Badge tone="warning">in {a.daysUntilDue}d</Badge>
                      )}
                    </TableCell>
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
            <CardTitle>Failure Frequency by Component</CardTitle>
            <CardDescription>Total maintenance cost by component, trailing 365 days</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {failureFrequency.length === 0 ? (
            <EmptyState title="No maintenance history" description="Failure frequency will appear once maintenance records are imported." />
          ) : (
            <>
              <FailureFrequencyChart data={failureFrequency} />
              <Table className="mt-4">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Component</TableHeaderCell>
                    <TableHeaderCell className="text-right">Records</TableHeaderCell>
                    <TableHeaderCell className="text-right">Emergency</TableHeaderCell>
                    <TableHeaderCell className="text-right">Downtime (hrs)</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total cost</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failureFrequency.map((f) => (
                    <TableRow key={f.component}>
                      <TableCell className="font-medium">{f.component}</TableCell>
                      <TableCell className="text-right">{f.totalRecords}</TableCell>
                      <TableCell className="text-right">
                        {f.emergencyRecords > 0 ? <Badge tone="danger">{f.emergencyRecords}</Badge> : "0"}
                      </TableCell>
                      <TableCell className="text-right">{f.totalDowntimeHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium">{formatInr(f.totalCostInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
