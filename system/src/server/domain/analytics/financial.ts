import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, pct, daysBetween } from "./shared";

/**
 * Financial Intelligence (CLAUDE.md Phase 6 "Financial Intelligence").
 *
 * Revenue recognition: we use `payments.payment_date` (cash received),
 * NOT booking_date or trip_date, because that is when money actually moved —
 * this is the same convention Executive/Cash Flow uses elsewhere.
 *
 * Variable vs fixed costs (used for gross/contribution margin): expense
 * categories that scale directly with trips/passengers are treated as
 * variable — 'fuel' and 'inventory'. Everything else ('maintenance',
 * 'salary', 'insurance', 'port_fees', 'marketing', 'other') is fixed/
 * overhead for margin purposes. This is a modeling choice, documented here
 * so it's easy to challenge/change later.
 */

const VARIABLE_EXPENSE_CATEGORIES = ["fuel", "inventory"] as const;

export interface RevenueBreakdown {
  totalInr: number;
  byPaymentType: Record<string, number>;
}

export interface ExpenseBreakdown {
  totalInr: number;
  byCategory: Record<string, number>;
}

export interface FinancialSummary {
  range: DateRange;
  revenue: RevenueBreakdown;
  expenses: ExpenseBreakdown;
  profitInr: number;
  grossMarginPct: number | null; // (revenue - variable costs) / revenue
  netMarginPct: number | null; // (revenue - all costs) / revenue
  contributionMarginPct: number | null; // same base as gross margin here (see notes)
}

function revenueBreakdown(database: Db, range: DateRange): RevenueBreakdown {
  const rows = database
    .prepare(
      `SELECT payment_type, SUM(CASE WHEN payment_type = 'refund' THEN -amount_inr ELSE amount_inr END) AS net
       FROM payments
       WHERE status = 'completed' AND payment_date BETWEEN ? AND ?
       GROUP BY payment_type`
    )
    .all(range.from, range.to) as { payment_type: string; net: number }[];

  const byPaymentType: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byPaymentType[r.payment_type] = r.net;
    total += r.net;
  }
  return { totalInr: roundInt(total), byPaymentType };
}

function expenseBreakdown(database: Db, range: DateRange): ExpenseBreakdown {
  const rows = database
    .prepare(
      `SELECT category, SUM(amount_inr) AS total FROM expenses
       WHERE expense_date BETWEEN ? AND ? GROUP BY category`
    )
    .all(range.from, range.to) as { category: string; total: number }[];

  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byCategory[r.category] = r.total;
    total += r.total;
  }
  return { totalInr: roundInt(total), byCategory };
}

export function getFinancialSummary(database: Db | undefined, range: DateRange): FinancialSummary {
  const d = resolveDb(database);
  const revenue = revenueBreakdown(d, range);
  const expenses = expenseBreakdown(d, range);

  const variableCosts = VARIABLE_EXPENSE_CATEGORIES.reduce((sum, cat) => sum + (expenses.byCategory[cat] ?? 0), 0);
  const profit = revenue.totalInr - expenses.totalInr;

  const grossMarginPct = revenue.totalInr > 0 ? pct(safeDiv(revenue.totalInr - variableCosts, revenue.totalInr)) : null;
  const netMarginPct = revenue.totalInr > 0 ? pct(safeDiv(profit, revenue.totalInr)) : null;

  return {
    range,
    revenue,
    expenses,
    profitInr: profit,
    grossMarginPct,
    netMarginPct,
    // Contribution margin, in the absence of trip-level fixed/variable
    // splits, is modeled identically to gross margin (revenue net of
    // variable/direct costs). See perTripProfit for a per-unit view.
    contributionMarginPct: grossMarginPct,
  };
}

// ---------------------------------------------------------------------------
// Per-trip / per-route / per-cruise-type profit
// ---------------------------------------------------------------------------

export interface TripProfit {
  tripId: string;
  tripDate: string;
  vesselId: string;
  routeId: string;
  cruiseTypeId: string;
  revenueInr: number;
  expensesInr: number;
  profitInr: number;
}

function tripProfits(database: Db, range: DateRange): TripProfit[] {
  const trips = database
    .prepare(
      `SELECT trip_id, trip_date, vessel_id, route_id, cruise_type_id FROM trips
       WHERE trip_date BETWEEN ? AND ? AND status != 'cancelled'`
    )
    .all(range.from, range.to) as {
    trip_id: string;
    trip_date: string;
    vessel_id: string;
    route_id: string;
    cruise_type_id: string;
  }[];

  const revenueStmt = database.prepare(
    `SELECT COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS net
     FROM payments p JOIN bookings b ON b.booking_id = p.booking_id
     WHERE p.status = 'completed' AND b.trip_id = ?`
  );
  const expenseStmt = database.prepare(`SELECT COALESCE(SUM(amount_inr), 0) AS total FROM expenses WHERE trip_id = ?`);

  return trips.map((t) => {
    const revenue = (revenueStmt.get(t.trip_id) as { net: number }).net;
    const expenses = (expenseStmt.get(t.trip_id) as { total: number }).total;
    return {
      tripId: t.trip_id,
      tripDate: t.trip_date,
      vesselId: t.vessel_id,
      routeId: t.route_id,
      cruiseTypeId: t.cruise_type_id,
      revenueInr: roundInt(revenue),
      expensesInr: roundInt(expenses),
      profitInr: roundInt(revenue - expenses),
    };
  });
}

export function getPerTripProfit(database: Db | undefined, range: DateRange): TripProfit[] {
  return tripProfits(resolveDb(database), range);
}

export interface GroupedProfit {
  key: string;
  revenueInr: number;
  expensesInr: number;
  profitInr: number;
  tripCount: number;
}

function groupTripProfits(trips: TripProfit[], keyOf: (t: TripProfit) => string): GroupedProfit[] {
  const groups = new Map<string, GroupedProfit>();
  for (const t of trips) {
    const key = keyOf(t);
    const g = groups.get(key) ?? { key, revenueInr: 0, expensesInr: 0, profitInr: 0, tripCount: 0 };
    g.revenueInr += t.revenueInr;
    g.expensesInr += t.expensesInr;
    g.profitInr += t.profitInr;
    g.tripCount += 1;
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function getPerRouteProfit(database: Db | undefined, range: DateRange): GroupedProfit[] {
  const trips = tripProfits(resolveDb(database), range);
  return groupTripProfits(trips, (t) => t.routeId);
}

/** Cruise-type profit is attributed at the trip level (trips.cruise_type_id)
 * for expense allocation, since expenses are trip-scoped facts. Revenue by
 * cruise type as purchased (bookings.cruise_type_id, which can in principle
 * differ from the trip's own cruise_type_id) is available separately via
 * getRevenueByBookingCruiseType. */
export function getPerCruiseTypeProfit(database: Db | undefined, range: DateRange): GroupedProfit[] {
  const trips = tripProfits(resolveDb(database), range);
  return groupTripProfits(trips, (t) => t.cruiseTypeId);
}

export function getRevenueByBookingCruiseType(
  database: Db | undefined,
  range: DateRange
): { cruiseTypeId: string; revenueInr: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT b.cruise_type_id AS cruiseTypeId,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS revenueInr
       FROM payments p
       JOIN bookings b ON b.booking_id = p.booking_id
       WHERE p.status = 'completed' AND p.payment_date BETWEEN ? AND ?
       GROUP BY b.cruise_type_id`
    )
    .all(range.from, range.to) as { cruiseTypeId: string; revenueInr: number }[];
  return rows.map((r) => ({ ...r, revenueInr: roundInt(r.revenueInr) }));
}

// ---------------------------------------------------------------------------
// Cash flow trend (daily or weekly buckets)
// ---------------------------------------------------------------------------

export interface CashFlowBucket {
  bucket: string; // "YYYY-MM-DD" (daily) or ISO week-start date (weekly)
  revenueInr: number;
  expensesInr: number;
  netInr: number;
}

export function getCashFlowTrend(
  database: Db | undefined,
  range: DateRange,
  granularity: "day" | "week" = "day"
): CashFlowBucket[] {
  const d = resolveDb(database);

  const revenueRows = d
    .prepare(
      `SELECT payment_date AS date, SUM(CASE WHEN payment_type = 'refund' THEN -amount_inr ELSE amount_inr END) AS net
       FROM payments WHERE status = 'completed' AND payment_date BETWEEN ? AND ? GROUP BY payment_date`
    )
    .all(range.from, range.to) as { date: string; net: number }[];

  const expenseRows = d
    .prepare(
      `SELECT expense_date AS date, SUM(amount_inr) AS total FROM expenses
       WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date`
    )
    .all(range.from, range.to) as { date: string; total: number }[];

  const buckets = new Map<string, CashFlowBucket>();
  const bucketKey = (dateStr: string) => (granularity === "day" ? dateStr : startOfIsoWeek(dateStr));

  for (const r of revenueRows) {
    const key = bucketKey(r.date);
    const b = buckets.get(key) ?? { bucket: key, revenueInr: 0, expensesInr: 0, netInr: 0 };
    b.revenueInr += r.net;
    buckets.set(key, b);
  }
  for (const r of expenseRows) {
    const key = bucketKey(r.date);
    const b = buckets.get(key) ?? { bucket: key, revenueInr: 0, expensesInr: 0, netInr: 0 };
    b.expensesInr += r.total;
    buckets.set(key, b);
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, netInr: b.revenueInr - b.expensesInr }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

function startOfIsoWeek(dateStr: string): string {
  const dt = new Date(dateStr + "T00:00:00Z");
  const day = dt.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * Payroll for a range = sum(crew.monthly_salary_inr) x number of whole
 * calendar months of the range each crew member was employed. A crew member
 * counts as employed for a given month if joined_date <= end of that month
 * AND status != 'departed' (the schema has no departure date, so a departed
 * crew member is conservatively excluded from every month in the range —
 * this will slightly understate historical payroll for anyone who departed
 * mid-range; flagged here as a schema limitation, not guessed around).
 */
export interface PayrollSummary {
  range: DateRange;
  totalInr: number;
  monthsInRange: number;
  byCrew: { crewId: string; fullName: string; monthlySalaryInr: number; monthsCounted: number; totalInr: number }[];
}

export function getPayrollTotal(database: Db | undefined, range: DateRange): PayrollSummary {
  const d = resolveDb(database);
  const crew = d
    .prepare(`SELECT crew_id, full_name, monthly_salary_inr, joined_date, status FROM crew`)
    .all() as { crew_id: string; full_name: string; monthly_salary_inr: number; joined_date: string; status: string }[];

  const months = monthsInRange(range);

  const byCrew = crew
    .map((c) => {
      const monthsCounted = months.filter((m) => c.joined_date <= m.end && c.status !== "departed").length;
      return {
        crewId: c.crew_id,
        fullName: c.full_name,
        monthlySalaryInr: c.monthly_salary_inr,
        monthsCounted,
        totalInr: roundInt(c.monthly_salary_inr * monthsCounted),
      };
    })
    .filter((c) => c.monthsCounted > 0);

  return {
    range,
    totalInr: byCrew.reduce((sum, c) => sum + c.totalInr, 0),
    monthsInRange: months.length,
    byCrew,
  };
}

function monthsInRange(range: DateRange): { start: string; end: string }[] {
  const result: { start: string; end: string }[] = [];
  let cursor = new Date(range.from.slice(0, 7) + "-01T00:00:00Z");
  const stop = new Date(range.to.slice(0, 7) + "-01T00:00:00Z");
  while (cursor <= stop) {
    const start = cursor.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    result.push({ start, end });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Vendor payment totals
// ---------------------------------------------------------------------------

export function getVendorPaymentTotals(
  database: Db | undefined,
  range: DateRange
): { vendorName: string; totalInr: number; expenseCount: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT COALESCE(vendor_name, '(unspecified)') AS vendorName, SUM(amount_inr) AS totalInr, COUNT(*) AS expenseCount
       FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY vendorName ORDER BY totalInr DESC`
    )
    .all(range.from, range.to) as { vendorName: string; totalInr: number; expenseCount: number }[];
  return rows.map((r) => ({ ...r, totalInr: roundInt(r.totalInr) }));
}

import { computeAnnualFixedOpex, computeWeightedAvgTicketPrice, getParam } from "./shared";

// ---------------------------------------------------------------------------
// Break-even Occupancy Rate
// ---------------------------------------------------------------------------

export interface BreakEvenAnalysis {
  annualFixedOpexInr: number;
  avgTicketPriceInr: number;
  totalCapacityAnnual: number;
  breakevenOccupancyPct: number;
}

export function getBreakevenOccupancy(database: Db | undefined): BreakEvenAnalysis {
  const d = resolveDb(database);
  
  const annualFixedOpexInr = computeAnnualFixedOpex(d);
  const avgTicketPriceInr = computeWeightedAvgTicketPrice(d);
  
  // Total capacity = trips per day * days * capacity per trip
  const tripsPerDay = getParam(d, "trips_per_day");
  
  // Let's get total capacity of active vessels
  const vessels = d.prepare("SELECT SUM(capacity) AS c FROM vessels WHERE status = 'active'").get() as { c: number };
  const vesselCapacity = vessels.c || 0;
  
  const opDaysPeak = getParam(d, "op_days_peak");
  const opDaysShoulder = getParam(d, "op_days_shoulder");
  const opDaysOffseason = getParam(d, "op_days_offseason");
  const totalOpDays = opDaysPeak + opDaysShoulder + opDaysOffseason;
  
  const totalCapacityAnnual = tripsPerDay * totalOpDays * vesselCapacity;
  
  // Breakeven Passengers = Fixed Costs / Avg Ticket Price
  // Note: we are ignoring variable costs per passenger for this high level metric for now, 
  // or we could deduct estimated fuel per passenger.
  const breakevenPassengers = avgTicketPriceInr > 0 ? annualFixedOpexInr / avgTicketPriceInr : 0;
  
  const breakevenOccupancyPct = totalCapacityAnnual > 0 ? pct(safeDiv(breakevenPassengers, totalCapacityAnnual)) : 0;
  
  return {
    annualFixedOpexInr: roundInt(annualFixedOpexInr),
    avgTicketPriceInr: roundInt(avgTicketPriceInr),
    totalCapacityAnnual: roundInt(totalCapacityAnnual),
    breakevenOccupancyPct,
  };
}

export { daysBetween, round2 };
