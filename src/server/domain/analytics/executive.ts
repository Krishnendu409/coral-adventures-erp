import type { Db } from "./shared";
import { db as resolveDb, todayStr, trailingRange, safeDiv, round2, roundInt, computeNps } from "./shared";

/**
 * Executive Dashboard (CLAUDE.md Phase 6 "Executive Dashboard").
 * Every figure is computed live from trips/bookings/payments/expenses/
 * fuel_logs/feedback/maintenance_records/import_batches — nothing here is a
 * stored KPI column.
 */

export interface ExecutiveSummary {
  date: string;
  todayTripCount: number;
  todayRevenueInr: number;
  todayExpensesInr: number;
  todayProfitInr: number;
  todayOccupancyPct: number;
  todayFuelCostInr: number;
  nps: { windowDays: number; score: number | null; responses: number };
  openMaintenanceAlerts: number;
  pendingImports: number;
  cashFlow: { windowDays: number; revenueInr: number; expensesInr: number; netInr: number };
  upcomingBookingsCount: number;
}

interface TripRow {
  trip_id: string;
  capacity: number;
}

/** Trips scheduled for `date`, excluding cancelled trips (a cancelled trip
 * never boarded passengers so it contributes 0 capacity/occupancy, but its
 * booking/refund activity still flows through revenue naturally). */
function tripsForDate(database: Db, date: string): TripRow[] {
  return database
    .prepare(`SELECT trip_id, capacity FROM trips WHERE trip_date = ? AND status != 'cancelled'`)
    .all(date) as TripRow[];
}

/** Revenue for a set of trips = sum(payments) for bookings tied to those
 * trips, refunds subtracted. Payments are matched by the trip they belong to
 * (via booking_id -> trip_id) regardless of the payment's own date, per spec. */
function revenueForTrips(database: Db, tripIds: string[]): number {
  if (tripIds.length === 0) return 0;
  const placeholders = tripIds.map(() => "?").join(",");
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS net
       FROM payments p
       JOIN bookings b ON b.booking_id = p.booking_id
       WHERE p.status = 'completed' AND b.trip_id IN (${placeholders})`
    )
    .get(...tripIds) as { net: number };
  return row.net;
}

/** Expenses "attributable" to a date = expenses directly tied to that day's
 * trips (fuel, trip-specific maintenance, etc.) plus overhead-style expenses
 * (trip_id IS NULL) dated that same day (salary/insurance/etc. postings). */
function expensesForDate(database: Db, date: string, tripIds: string[]): number {
  const tripLinked =
    tripIds.length === 0
      ? 0
      : (
          database
            .prepare(
              `SELECT COALESCE(SUM(amount_inr), 0) AS total FROM expenses WHERE trip_id IN (${tripIds
                .map(() => "?")
                .join(",")})`
            )
            .get(...tripIds) as { total: number }
        ).total;

  const overhead = (
    database
      .prepare(`SELECT COALESCE(SUM(amount_inr), 0) AS total FROM expenses WHERE trip_id IS NULL AND expense_date = ?`)
      .get(date) as { total: number }
  ).total;

  return tripLinked + overhead;
}

function occupancyForTrips(database: Db, tripIds: string[]): { passengers: number; capacity: number; pct: number } {
  const capacity = tripIds.length
    ? (
        database
          .prepare(`SELECT COALESCE(SUM(capacity), 0) AS c FROM trips WHERE trip_id IN (${tripIds.map(() => "?").join(",")})`)
          .get(...tripIds) as { c: number }
      ).c
    : 0;

  const passengers = tripIds.length
    ? (
        database
          .prepare(
            `SELECT COALESCE(SUM(passenger_count), 0) AS p FROM bookings
             WHERE trip_id IN (${tripIds.map(() => "?").join(",")}) AND status IN ('confirmed', 'completed')`
          )
          .get(...tripIds) as { p: number }
      ).p
    : 0;

  return { passengers, capacity, pct: pct2(passengers, capacity) };
}

function pct2(numerator: number, denominator: number): number {
  return round2(safeDiv(numerator, denominator, 0) * 100);
}

function fuelCostForTrips(database: Db, tripIds: string[]): number {
  if (tripIds.length === 0) return 0;
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(cost_inr), 0) AS total FROM fuel_logs WHERE trip_id IN (${tripIds.map(() => "?").join(",")})`
    )
    .get(...tripIds) as { total: number };
  return row.total;
}

/** NPS over a trailing window (defaults to last 30 days by submitted_date). */
function npsWindow(database: Db, asOf: string, windowDays: number) {
  const range = trailingRange(windowDays, asOf);
  const rows = database
    .prepare(`SELECT nps_score FROM feedback WHERE submitted_date BETWEEN ? AND ? AND nps_score IS NOT NULL`)
    .all(range.from, range.to) as { nps_score: number }[];
  return computeNps(rows.map((r) => r.nps_score));
}

/** Maintenance items needing attention "now": anything not completed, plus
 * anything due within ALERT_WINDOW_DAYS (including already overdue). */
const MAINTENANCE_ALERT_WINDOW_DAYS = 14;

function openMaintenanceAlertCount(database: Db, asOf: string): number {
  const horizon = trailingRange(1, asOf).to; // asOf itself
  const dueBy = new Date(horizon + "T00:00:00Z");
  dueBy.setUTCDate(dueBy.getUTCDate() + MAINTENANCE_ALERT_WINDOW_DAYS);
  const dueByStr = dueBy.toISOString().slice(0, 10);

  const row = database
    .prepare(
      `SELECT COUNT(*) AS n FROM maintenance_records
       WHERE status != 'completed'
          OR (next_due_date IS NOT NULL AND next_due_date <= ?)`
    )
    .get(dueByStr) as { n: number };
  return row.n;
}

function pendingImportsCount(database: Db): number {
  const row = database.prepare(`SELECT COUNT(*) AS n FROM import_batches WHERE status != 'committed'`).get() as {
    n: number;
  };
  return row.n;
}

function cashFlowWindow(database: Db, asOf: string, windowDays: number) {
  const range = trailingRange(windowDays, asOf);
  const revenue = database
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount_inr ELSE amount_inr END), 0) AS net
       FROM payments WHERE status = 'completed' AND payment_date BETWEEN ? AND ?`
    )
    .get(range.from, range.to) as { net: number };
  const expenses = database
    .prepare(`SELECT COALESCE(SUM(amount_inr), 0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?`)
    .get(range.from, range.to) as { total: number };
  return { windowDays, revenueInr: revenue.net, expensesInr: expenses.total, netInr: revenue.net - expenses.total };
}

function upcomingBookingsCount(database: Db, asOf: string): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings b
       JOIN trips t ON t.trip_id = b.trip_id
       WHERE t.trip_date > ? AND b.status = 'confirmed'`
    )
    .get(asOf) as { n: number };
  return row.n;
}

export function getExecutiveSummary(
  database?: Db,
  date: string = todayStr(),
  options: { npsWindowDays?: number; cashFlowWindowDays?: number } = {}
): ExecutiveSummary {
  const d = resolveDb(database);
  const { npsWindowDays = 30, cashFlowWindowDays = 30 } = options;

  const trips = tripsForDate(d, date);
  const tripIds = trips.map((t) => t.trip_id);

  const revenue = revenueForTrips(d, tripIds);
  const expenses = expensesForDate(d, date, tripIds);
  const occupancy = occupancyForTrips(d, tripIds);
  const fuelCost = fuelCostForTrips(d, tripIds);
  const nps = npsWindow(d, date, npsWindowDays);

  return {
    date,
    todayTripCount: trips.length,
    todayRevenueInr: roundInt(revenue),
    todayExpensesInr: roundInt(expenses),
    todayProfitInr: roundInt(revenue - expenses),
    todayOccupancyPct: occupancy.pct,
    todayFuelCostInr: roundInt(fuelCost),
    nps: { windowDays: npsWindowDays, score: nps.npsScore, responses: nps.responses },
    openMaintenanceAlerts: openMaintenanceAlertCount(d, date),
    pendingImports: pendingImportsCount(d),
    cashFlow: cashFlowWindow(d, date, cashFlowWindowDays),
    upcomingBookingsCount: upcomingBookingsCount(d, date),
  };
}
