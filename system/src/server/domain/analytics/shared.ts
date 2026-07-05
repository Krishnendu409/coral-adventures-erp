import type Database from "better-sqlite3";
import { getDb } from "../../db/client";

/**
 * Shared helpers for every analytics module.
 *
 * HARD RULE (see CLAUDE.md "Analytics Philosophy"): nothing in this
 * directory ever writes to the database. Every function here runs plain
 * SELECT statements and computes its result at request time from raw fact
 * rows. Revenue, profit, occupancy, LTV, CAC, ROI, NPS, RevPASH, break-even,
 * utilization, etc. are NEVER read from a stored column — they are always
 * derived here.
 */

export type Db = Database.Database;

export function db(passed?: Db): Db {
  return passed ?? getDb();
}

// ---------------------------------------------------------------------------
// Date helpers. All dates in the schema are ISO strings ("YYYY-MM-DD" for
// dates, "YYYY-MM-DDTHH:MM:SS(.sss)Z"-ish for timestamps). We treat plain
// dates as lexicographically comparable, which is safe for ISO-8601.
// ---------------------------------------------------------------------------

export interface DateRange {
  from: string; // inclusive, "YYYY-MM-DD"
  to: string; // inclusive, "YYYY-MM-DD"
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00Z").getTime();
  const to = new Date(toStr + "T00:00:00Z").getTime();
  return Math.round((to - from) / 86_400_000);
}

/** Default trailing window ending today, inclusive of today. */
export function trailingRange(days: number, asOf: string = todayStr()): DateRange {
  return { from: addDaysStr(asOf, -(days - 1)), to: asOf };
}

export function monthBucket(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator) return fallback;
  return numerator / denominator;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundInt(n: number): number {
  return Math.round(n);
}

export function pct(n: number): number {
  // n is a 0..1 fraction -> percentage rounded to 2 dp
  return round2(n * 100);
}

// ---------------------------------------------------------------------------
// business_parameters access. This table IS the config the KPI formulas read
// their inputs from (see schema/001_reference_tables.sql). A handful of rows
// (A07, A13, A17, A23, A24, A43, A63-A66 — see erp_field constants below) are
// themselves derived/formula cells from the source workbook and are known to
// carry stale or broken cached values (see docs/business/*-extract.json
// notes). The analytics engine must NEVER read those derived rows directly;
// instead it recomputes the same quantity live from the underlying raw
// erp_fields. See `computeAnnualFixedOpex` / `computeAnnualFuelCostAssumed`
// below for the two cases this module needs.
// ---------------------------------------------------------------------------

/** erp_fields in business_parameters that are themselves derived/formula
 * cells from the source workbook and must never be read directly. */
export const DERIVED_PARAM_FIELDS = new Set([
  "total_op_days", // A07
  "avg_ticket_price", // A13
  "annual_maintenance", // A17
  "annual_fuel_cost", // A23
  "total_fixed_opex", // A24
  "avg_seasonality", // A43
  "breakeven_occupancy", // A63
]);

interface ParamRow {
  value: number | null;
}

/** Reads a raw business_parameters.value by erp_field. Throws if missing or
 * null (a missing required assumption is a data problem, not something to
 * silently default). Use getParamOrNull for genuinely optional inputs. */
export function getParam(database: Db, erpField: string): number {
  const row = database
    .prepare("SELECT value FROM business_parameters WHERE erp_field = ?")
    .get(erpField) as ParamRow | undefined;
  if (!row || row.value === null || row.value === undefined) {
    throw new Error(`analytics: missing business_parameters.value for erp_field '${erpField}'`);
  }
  return row.value;
}

export function getParamOrNull(database: Db, erpField: string): number | null {
  const row = database
    .prepare("SELECT value FROM business_parameters WHERE erp_field = ?")
    .get(erpField) as ParamRow | undefined;
  return row?.value ?? null;
}

export function getParamOr(database: Db, erpField: string, fallback: number): number {
  return getParamOrNull(database, erpField) ?? fallback;
}

/**
 * Live recomputation of "Total Annual Fixed Operating Cost" (source
 * workbook's A24 / erp_field total_fixed_opex — a stored value of
 * ₹108,237,000.72 that is almost certainly a broken workbook formula given
 * the scale of this single-vessel business, which is exactly the kind of
 * stale-derived-cell the docs/business extract note warns about). Recomputed
 * here from the raw component assumptions instead:
 *   annual maintenance   = vessel_value * maintenance_pct
 *   annual staff cost    = (captain_salary + 2 * crew_salary + ops_staff_cost) * 12
 *   annual insurance     = annual_insurance
 *   annual port fees     = port_fees_annual
 * Excludes fuel (variable, see computeAnnualFuelCostAssumed) and marketing
 * spend, matching the workbook's own definition in A24's notes.
 */
export function computeAnnualFixedOpex(database: Db): number {
  const vesselValue = getParam(database, "vessel_value");
  const maintenancePct = getParam(database, "maintenance_pct");
  const captainSalary = getParam(database, "captain_salary");
  const crewSalary = getParam(database, "crew_salary");
  const opsStaffCost = getParam(database, "ops_staff_cost");
  const annualInsurance = getParam(database, "annual_insurance");
  const portFeesAnnual = getParam(database, "port_fees_annual");

  const annualMaintenance = vesselValue * maintenancePct;
  const annualStaffCost = (captainSalary + 2 * crewSalary + opsStaffCost) * 12;

  return annualMaintenance + annualStaffCost + annualInsurance + portFeesAnnual;
}

/**
 * Live recomputation of "Annual Fuel Cost (Total)" (A23 / annual_fuel_cost,
 * stored as null in the source extract — never populated). Formula per the
 * workbook's own notes: fuel_cost_hr * trip_duration_hrs * trips_per_day *
 * total_op_days. total_op_days itself is recomputed from A04+A05+A06 rather
 * than read from the derived total_op_days row.
 * This is a PLANNING estimate (used by break-even/marketing-planning
 * formulas before/alongside real data). Actual fuel spend should be read
 * from fuel_logs/expenses wherever real trip history exists — see
 * financial.ts / operations.ts.
 */
export function computeAnnualFuelCostAssumed(database: Db): number {
  const fuelCostHr = getParam(database, "fuel_cost_hr");
  const tripDurationHrs = getParam(database, "trip_duration_hrs");
  const tripsPerDay = getParam(database, "trips_per_day");
  const totalOpDays = computeTotalOpDays(database);
  return fuelCostHr * tripDurationHrs * tripsPerDay * totalOpDays;
}

/** Live recomputation of A07 (total_op_days) from A04+A05+A06. */
export function computeTotalOpDays(database: Db): number {
  return (
    getParam(database, "op_days_peak") +
    getParam(database, "op_days_shoulder") +
    getParam(database, "op_days_offseason")
  );
}

/** Live recomputation of A13 (avg_ticket_price): a 70/30 standard/premium
 * blend per the workbook's own documented assumption (see notes on A13). */
export function computeWeightedAvgTicketPrice(database: Db): number {
  const standard = getParam(database, "ticket_price_standard");
  const premium = getParam(database, "ticket_price_premium");
  return 0.7 * standard + 0.3 * premium;
}

// ---------------------------------------------------------------------------
// NPS: Net Promoter Score is always (%promoters - %detractors), computed
// live from feedback.nps_score, never stored.
//   Promoters:  9-10
//   Passives:   7-8
//   Detractors: 0-6
// ---------------------------------------------------------------------------
export interface NpsResult {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number | null; // -100..100, null if no responses
  avgRawScore: number | null;
}

export function computeNps(scores: number[]): NpsResult {
  const responses = scores.length;
  if (responses === 0) {
    return { responses: 0, promoters: 0, passives: 0, detractors: 0, npsScore: null, avgRawScore: null };
  }
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const passives = responses - promoters - detractors;
  const npsScore = round2(((promoters - detractors) / responses) * 100);
  const avgRawScore = round2(scores.reduce((a, b) => a + b, 0) / responses);
  return { responses, promoters, passives, detractors, npsScore, avgRawScore };
}
