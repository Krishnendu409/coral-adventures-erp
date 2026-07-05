import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, addDaysStr, getParam, computeWeightedAvgTicketPrice } from "./shared";

/**
 * Maintenance Intelligence (CLAUDE.md Phase 6 "Maintenance Intelligence").
 * Upcoming/overdue maintenance, failure frequency, downtime cost, and a
 * composite "boat health score" — all computed live from maintenance_records.
 */

export interface MaintenanceAlert {
  maintenanceId: string;
  vesselId: string;
  component: string;
  type: string;
  status: string;
  nextDueDate: string | null;
  daysUntilDue: number | null; // negative = overdue
}

const UPCOMING_WINDOW_DAYS = 14;

export function getUpcomingAndOverdueMaintenance(database: Db | undefined, asOf: string): MaintenanceAlert[] {
  const d = resolveDb(database);
  const horizon = addDaysStr(asOf, UPCOMING_WINDOW_DAYS);

  const rows = d
    .prepare(
      `SELECT maintenance_id, vessel_id, component, type, status, next_due_date
       FROM maintenance_records
       WHERE status != 'completed' OR (next_due_date IS NOT NULL AND next_due_date <= ?)
       ORDER BY next_due_date ASC`
    )
    .all(horizon) as {
    maintenance_id: string;
    vessel_id: string;
    component: string;
    type: string;
    status: string;
    next_due_date: string | null;
  }[];

  return rows.map((r) => ({
    maintenanceId: r.maintenance_id,
    vesselId: r.vessel_id,
    component: r.component,
    type: r.type,
    status: r.status,
    nextDueDate: r.next_due_date,
    daysUntilDue: r.next_due_date
      ? Math.round((new Date(r.next_due_date + "T00:00:00Z").getTime() - new Date(asOf + "T00:00:00Z").getTime()) / 86_400_000)
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Failure frequency by component
// ---------------------------------------------------------------------------

export interface FailureFrequency {
  component: string;
  totalRecords: number;
  emergencyRecords: number;
  totalCostInr: number;
  totalDowntimeHours: number;
}

export function getFailureFrequencyByComponent(database: Db | undefined, range: DateRange): FailureFrequency[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT component,
              COUNT(*) AS totalRecords,
              SUM(CASE WHEN type = 'emergency' THEN 1 ELSE 0 END) AS emergencyRecords,
              COALESCE(SUM(cost_inr), 0) AS totalCostInr,
              COALESCE(SUM(downtime_hours), 0) AS totalDowntimeHours
       FROM maintenance_records WHERE maintenance_date BETWEEN ? AND ?
       GROUP BY component ORDER BY totalRecords DESC`
    )
    .all(range.from, range.to) as FailureFrequency[];
  return rows.map((r) => ({ ...r, totalCostInr: roundInt(r.totalCostInr), totalDowntimeHours: round2(r.totalDowntimeHours) }));
}

// ---------------------------------------------------------------------------
// Downtime cost. There is no business_parameters erp_field for a
// downtime-cost-per-hour assumption (checked against the 66-row master
// assumptions extract), so this is estimated live as the opportunity cost of
// a lost operating hour: average revenue actually earned per trip in the
// trailing 90 days, divided by the assumed trip_duration_hrs. If there is no
// trailing revenue data yet, falls back fully to assumptions: weighted avg
// ticket price * vessel_capacity * target peak occupancy, / trip_duration_hrs.
// FLAGGED: this is a documented estimate, not a stored/config figure — a
// real "downtime_cost_per_hour" business_parameters row should replace it.
// ---------------------------------------------------------------------------

export interface DowntimeCost {
  range: DateRange;
  totalDowntimeHours: number;
  estimatedCostPerHourInr: number;
  estimatedTotalCostInr: number;
  costPerHourBasis: "actual_trailing_90d_revenue" | "assumption_based";
}

export function getDowntimeCost(database: Db | undefined, asOf: string, range: DateRange): DowntimeCost {
  const d = resolveDb(database);
  const tripDurationHrs = getParam(d, "trip_duration_hrs");

  const from90 = addDaysStr(asOf, -90);
  const actual = d
    .prepare(
      `SELECT COUNT(DISTINCT t.trip_id) AS tripCount,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS revenue
       FROM trips t
       JOIN bookings b ON b.trip_id = t.trip_id
       JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
       WHERE t.trip_date BETWEEN ? AND ? AND t.status = 'completed'`
    )
    .get(from90, asOf) as { tripCount: number; revenue: number };

  let costPerHourInr: number;
  let basis: DowntimeCost["costPerHourBasis"];

  if (actual.tripCount > 0) {
    const avgRevenuePerTrip = actual.revenue / actual.tripCount;
    costPerHourInr = round2(avgRevenuePerTrip / tripDurationHrs);
    basis = "actual_trailing_90d_revenue";
  } else {
    const vesselCapacity = getParam(d, "vessel_capacity");
    const targetOccPeak = getParam(d, "target_occ_peak");
    const avgTicketPrice = computeWeightedAvgTicketPrice(d);
    const avgRevenuePerTrip = avgTicketPrice * vesselCapacity * targetOccPeak;
    costPerHourInr = round2(avgRevenuePerTrip / tripDurationHrs);
    basis = "assumption_based";
  }

  const downtimeRow = d
    .prepare(`SELECT COALESCE(SUM(downtime_hours), 0) AS total FROM maintenance_records WHERE maintenance_date BETWEEN ? AND ?`)
    .get(range.from, range.to) as { total: number };

  return {
    range,
    totalDowntimeHours: round2(downtimeRow.total),
    estimatedCostPerHourInr: costPerHourInr,
    estimatedTotalCostInr: roundInt(downtimeRow.total * costPerHourInr),
    costPerHourBasis: basis,
  };
}

// ---------------------------------------------------------------------------
// Boat health score: composite 0-100, weighted:
//   40% downtime      — hours of downtime in the trailing 90 days, capped at
//                        200 hours (worst case = 0 points), scaled linearly.
//   30% frequency      — count of maintenance records in trailing 90 days,
//                        capped at 15 records (worst case = 0 points).
//   30% recency        — days since the last completed maintenance, capped at
//                        180 days (0 points beyond that; freshly serviced = 100).
// Weights and caps are a documented, adjustable heuristic — not derived from
// any external benchmark.
// ---------------------------------------------------------------------------

const HEALTH_WEIGHTS = { downtime: 0.4, frequency: 0.3, recency: 0.3 } as const;
const DOWNTIME_CAP_HOURS = 200;
const FREQUENCY_CAP_RECORDS = 15;
const RECENCY_CAP_DAYS = 180;

export interface BoatHealthScore {
  vesselId: string;
  asOf: string;
  downtimeHoursTrailing90d: number;
  maintenanceRecordsTrailing90d: number;
  daysSinceLastService: number | null;
  score: number; // 0-100, higher is healthier
  components: { downtimeScore: number; frequencyScore: number; recencyScore: number };
}

export function getBoatHealthScore(database: Db | undefined, vesselId: string, asOf: string): BoatHealthScore {
  const d = resolveDb(database);
  const from90 = addDaysStr(asOf, -90);

  const row = d
    .prepare(
      `SELECT COALESCE(SUM(downtime_hours), 0) AS downtime, COUNT(*) AS records
       FROM maintenance_records WHERE vessel_id = ? AND maintenance_date BETWEEN ? AND ?`
    )
    .get(vesselId, from90, asOf) as { downtime: number; records: number };

  const lastServiceRow = d
    .prepare(
      `SELECT MAX(maintenance_date) AS lastDate FROM maintenance_records
       WHERE vessel_id = ? AND status = 'completed' AND maintenance_date <= ?`
    )
    .get(vesselId, asOf) as { lastDate: string | null };

  const daysSinceLastService = lastServiceRow.lastDate
    ? Math.round((new Date(asOf + "T00:00:00Z").getTime() - new Date(lastServiceRow.lastDate + "T00:00:00Z").getTime()) / 86_400_000)
    : null;

  const downtimeScore = round2(100 * (1 - Math.min(row.downtime, DOWNTIME_CAP_HOURS) / DOWNTIME_CAP_HOURS));
  const frequencyScore = round2(100 * (1 - Math.min(row.records, FREQUENCY_CAP_RECORDS) / FREQUENCY_CAP_RECORDS));
  const recencyScore =
    daysSinceLastService === null
      ? 50 // unknown service history: neutral score rather than penalizing or rewarding
      : round2(100 * (1 - Math.min(daysSinceLastService, RECENCY_CAP_DAYS) / RECENCY_CAP_DAYS));

  const score = round2(
    downtimeScore * HEALTH_WEIGHTS.downtime + frequencyScore * HEALTH_WEIGHTS.frequency + recencyScore * HEALTH_WEIGHTS.recency
  );

  return {
    vesselId,
    asOf,
    downtimeHoursTrailing90d: round2(row.downtime),
    maintenanceRecordsTrailing90d: row.records,
    daysSinceLastService,
    score,
    components: { downtimeScore, frequencyScore, recencyScore },
  };
}

export { safeDiv };
