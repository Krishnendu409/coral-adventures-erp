import type { Db } from "./shared";
import { db as resolveDb, round2, getParamOrNull } from "./shared";

/**
 * Forecasting Engine — LITE (CLAUDE.md Phase 8 "Forecasting").
 *
 * Deliberately simple and honest: no ML dependency, no hidden model. Two
 * plain building blocks —
 *   1. linear trend (ordinary least squares slope/intercept over the
 *      historical monthly series)
 *   2. a seasonality adjustment using the business_parameters
 *      seasonality_jan..seasonality_dec indices, applied only as a
 *      multiplicative tilt relative to the average seasonality of the
 *      months actually observed in history (so it doesn't double-count
 *      trend already visible in the data).
 * Every forecast returned is explicitly labeled `isDirectionalEstimate: true`
 * — this is not a demand-planning-grade model, it's a lightweight signal.
 */

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  value: number;
}

export interface ForecastPoint {
  month: string;
  forecastValue: number;
  isDirectionalEstimate: true;
}

/** Ordinary least squares over index (0..n-1) vs value. Returns null slope
 * for fewer than 2 points (not enough history to fit a line). */
function linearRegression(points: MonthlyPoint[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;

  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

function simpleMovingAverage(points: MonthlyPoint[], windowSize: number): number | null {
  if (points.length === 0) return null;
  const window = points.slice(-windowSize);
  return window.reduce((sum, p) => sum + p.value, 0) / window.length;
}

const MONTH_SEASONALITY_FIELDS = [
  "seasonality_jan",
  "seasonality_feb",
  "seasonality_mar",
  "seasonality_apr",
  "seasonality_may",
  "seasonality_jun",
  "seasonality_jul",
  "seasonality_aug",
  "seasonality_sep",
  "seasonality_oct",
  "seasonality_nov",
  "seasonality_dec",
] as const;

function seasonalityIndexForMonth(database: Db, monthNumber1to12: number): number | null {
  return getParamOrNull(database, MONTH_SEASONALITY_FIELDS[monthNumber1to12 - 1]);
}

function nextMonthStr(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Blends a linear trend projection with a seasonal tilt: for each forecast
 * month, the trend line gives a baseline, then it's scaled by
 * (seasonality[targetMonth] / avgSeasonality[observedMonths]) — i.e. "this
 * month is typically X% busier/quieter than the months we already have
 * history for". If seasonality assumptions or trend can't be computed
 * (insufficient history), falls back to a flat moving-average projection.
 */
export function forecastSeries(database: Db | undefined, history: MonthlyPoint[], periodsAhead: number): ForecastPoint[] {
  const d = resolveDb(database);
  if (history.length === 0) return [];

  const sorted = [...history].sort((a, b) => (a.month < b.month ? -1 : 1));
  const regression = linearRegression(sorted);
  const movingAvg = simpleMovingAverage(sorted, Math.min(3, sorted.length));

  const observedMonthNumbers = [...new Set(sorted.map((p) => Number(p.month.split("-")[1])))];
  const observedSeasonality = observedMonthNumbers
    .map((m) => seasonalityIndexForMonth(d, m))
    .filter((v): v is number => v !== null);
  const avgObservedSeasonality = observedSeasonality.length
    ? observedSeasonality.reduce((a, b) => a + b, 0) / observedSeasonality.length
    : null;

  const lastMonth = sorted[sorted.length - 1].month;
  const results: ForecastPoint[] = [];

  for (let i = 1; i <= periodsAhead; i++) {
    const targetMonth = nextMonthStr(lastMonth, i);
    const targetMonthNumber = Number(targetMonth.split("-")[1]);

    let baseline: number;
    if (regression) {
      baseline = regression.intercept + regression.slope * (sorted.length - 1 + i);
    } else {
      baseline = movingAvg ?? sorted[sorted.length - 1].value;
    }

    const targetSeasonality = seasonalityIndexForMonth(d, targetMonthNumber);
    let seasonalTilt = 1;
    if (targetSeasonality !== null && avgObservedSeasonality !== null && avgObservedSeasonality > 0) {
      seasonalTilt = targetSeasonality / avgObservedSeasonality;
    }

    const forecastValue = Math.max(0, baseline * seasonalTilt);
    results.push({ month: targetMonth, forecastValue: round2(forecastValue), isDirectionalEstimate: true });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Historical series builders + convenience wrappers
// ---------------------------------------------------------------------------

function monthlyRevenueHistory(database: Db, monthsBack: number): MonthlyPoint[] {
  const rows = database
    .prepare(
      `SELECT substr(payment_date, 1, 7) AS month,
              SUM(CASE WHEN payment_type = 'refund' THEN -amount_inr ELSE amount_inr END) AS value
       FROM payments WHERE status = 'completed'
       GROUP BY month ORDER BY month DESC LIMIT ?`
    )
    .all(monthsBack) as MonthlyPoint[];
  return rows.reverse();
}

function monthlyBookingsHistory(database: Db, monthsBack: number): MonthlyPoint[] {
  const rows = database
    .prepare(
      `SELECT substr(booking_date, 1, 7) AS month, COUNT(*) AS value
       FROM bookings WHERE status IN ('confirmed', 'completed')
       GROUP BY month ORDER BY month DESC LIMIT ?`
    )
    .all(monthsBack) as MonthlyPoint[];
  return rows.reverse();
}

function monthlyOccupancyHistory(database: Db, monthsBack: number): MonthlyPoint[] {
  const rows = database
    .prepare(
      `SELECT substr(t.trip_date, 1, 7) AS month,
              100.0 * COALESCE(SUM(b.passenger_count), 0) / SUM(t.capacity) AS value
       FROM trips t
       LEFT JOIN bookings b ON b.trip_id = t.trip_id AND b.status IN ('confirmed', 'completed')
       WHERE t.status != 'cancelled'
       GROUP BY month ORDER BY month DESC LIMIT ?`
    )
    .all(monthsBack) as MonthlyPoint[];
  return rows.reverse().map((r) => ({ ...r, value: round2(r.value) }));
}

export interface ForecastResult {
  metric: "revenue_inr" | "bookings" | "occupancy_pct";
  history: MonthlyPoint[];
  forecast: ForecastPoint[];
  method: "linear_trend_with_seasonal_tilt";
  disclaimer: "Directional estimate from a simple trend + seasonality model. Not a demand-planning-grade forecast.";
}

export function forecastRevenue(database: Db | undefined, periodsAhead = 3, monthsOfHistory = 12): ForecastResult {
  const d = resolveDb(database);
  const history = monthlyRevenueHistory(d, monthsOfHistory);
  return {
    metric: "revenue_inr",
    history,
    forecast: forecastSeries(d, history, periodsAhead),
    method: "linear_trend_with_seasonal_tilt",
    disclaimer: "Directional estimate from a simple trend + seasonality model. Not a demand-planning-grade forecast.",
  };
}

export function forecastBookings(database: Db | undefined, periodsAhead = 3, monthsOfHistory = 12): ForecastResult {
  const d = resolveDb(database);
  const history = monthlyBookingsHistory(d, monthsOfHistory);
  return {
    metric: "bookings",
    history,
    forecast: forecastSeries(d, history, periodsAhead),
    method: "linear_trend_with_seasonal_tilt",
    disclaimer: "Directional estimate from a simple trend + seasonality model. Not a demand-planning-grade forecast.",
  };
}

export function forecastOccupancy(database: Db | undefined, periodsAhead = 3, monthsOfHistory = 12): ForecastResult {
  const d = resolveDb(database);
  const history = monthlyOccupancyHistory(d, monthsOfHistory);
  return {
    metric: "occupancy_pct",
    history,
    forecast: forecastSeries(d, history, periodsAhead).map((f) => ({ ...f, forecastValue: Math.min(100, f.forecastValue) })),
    method: "linear_trend_with_seasonal_tilt",
    disclaimer: "Directional estimate from a simple trend + seasonality model. Not a demand-planning-grade forecast.",
  };
}
