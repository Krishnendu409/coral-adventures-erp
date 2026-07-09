import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, pct } from "./shared";

/**
 * Operations Intelligence (CLAUDE.md Phase 6 "Operations Intelligence").
 * All figures computed live from trips/fuel_logs/maintenance_records/
 * trip_crew_assignments/feedback rows in the given range.
 */

interface TripTimingRow {
  trip_id: string;
  vessel_id: string;
  route_id: string;
  trip_date: string;
  slot: string;
  scheduled_departure: string;
  actual_departure: string | null;
  scheduled_return: string;
  actual_return: string | null;
  capacity: number;
  status: string;
}

function tripsInRange(database: Db, range: DateRange): TripTimingRow[] {
  return database
    .prepare(
      `SELECT trip_id, vessel_id, route_id, trip_date, slot, scheduled_departure, actual_departure,
              scheduled_return, actual_return, capacity, status
       FROM trips WHERE trip_date BETWEEN ? AND ? ORDER BY vessel_id, scheduled_departure`
    )
    .all(range.from, range.to) as TripTimingRow[];
}

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

// ---------------------------------------------------------------------------
// Turnaround time: gap between one trip's actual_return and the NEXT trip's
// actual_departure, for the same vessel, in chronological order.
// ---------------------------------------------------------------------------

export interface TurnaroundEntry {
  vesselId: string;
  fromTripId: string;
  toTripId: string;
  turnaroundMinutes: number;
}

export function getTurnaroundTimes(database: Db | undefined, range: DateRange, vesselId?: string): TurnaroundEntry[] {
  const d = resolveDb(database);
  let trips = tripsInRange(d, range).filter((t) => t.actual_departure && t.actual_return);
  if (vesselId) trips = trips.filter((t) => t.vessel_id === vesselId);

  const byVessel = new Map<string, TripTimingRow[]>();
  for (const t of trips) {
    const list = byVessel.get(t.vessel_id) ?? [];
    list.push(t);
    byVessel.set(t.vessel_id, list);
  }

  const results: TurnaroundEntry[] = [];
  for (const [vessel, list] of byVessel) {
    list.sort((a, b) => a.actual_departure!.localeCompare(b.actual_departure!));
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const next = list[i + 1];
      const gap = minutesBetween(cur.actual_return!, next.actual_departure!);
      if (gap >= 0) {
        results.push({ vesselId: vessel, fromTripId: cur.trip_id, toTripId: next.trip_id, turnaroundMinutes: round2(gap) });
      }
    }
  }
  return results;
}

export function getAvgTurnaroundMinutes(database: Db | undefined, range: DateRange, vesselId?: string): number | null {
  const entries = getTurnaroundTimes(database, range, vesselId);
  if (entries.length === 0) return null;
  return round2(entries.reduce((sum, e) => sum + e.turnaroundMinutes, 0) / entries.length);
}

// ---------------------------------------------------------------------------
// Boarding / delay analysis: scheduled vs actual departure & return.
// Positive minutes = later than scheduled (a delay). Negative = early.
// ---------------------------------------------------------------------------

export interface DelayEntry {
  tripId: string;
  vesselId: string;
  routeId: string;
  slot: string;
  departureDelayMinutes: number | null;
  returnDelayMinutes: number | null;
}

export function getDelayAnalysis(database: Db | undefined, range: DateRange): DelayEntry[] {
  const trips = tripsInRange(resolveDb(database), range);
  return trips.map((t) => ({
    tripId: t.trip_id,
    vesselId: t.vessel_id,
    routeId: t.route_id,
    slot: t.slot,
    departureDelayMinutes: t.actual_departure ? round2(minutesBetween(t.scheduled_departure, t.actual_departure)) : null,
    returnDelayMinutes: t.actual_return ? round2(minutesBetween(t.scheduled_return, t.actual_return)) : null,
  }));
}

export interface DelaySummary {
  avgDepartureDelayMinutes: number | null;
  avgReturnDelayMinutes: number | null;
  onTimeDeparturePct: number | null; // departure within +/- 10 min of scheduled
  tripsAnalyzed: number;
}

const ON_TIME_TOLERANCE_MINUTES = 10;

export function getDelaySummary(database: Db | undefined, range: DateRange): DelaySummary {
  const entries = getDelayAnalysis(database, range).filter((e) => e.departureDelayMinutes !== null);
  if (entries.length === 0) {
    return { avgDepartureDelayMinutes: null, avgReturnDelayMinutes: null, onTimeDeparturePct: null, tripsAnalyzed: 0 };
  }
  const depDelays = entries.map((e) => e.departureDelayMinutes!) as number[];
  const retDelays = entries.map((e) => e.returnDelayMinutes).filter((v): v is number => v !== null);
  const onTime = entries.filter((e) => Math.abs(e.departureDelayMinutes!) <= ON_TIME_TOLERANCE_MINUTES).length;

  return {
    avgDepartureDelayMinutes: round2(depDelays.reduce((a, b) => a + b, 0) / depDelays.length),
    avgReturnDelayMinutes: retDelays.length ? round2(retDelays.reduce((a, b) => a + b, 0) / retDelays.length) : null,
    onTimeDeparturePct: pct(safeDiv(onTime, entries.length)),
    tripsAnalyzed: entries.length,
  };
}

// ---------------------------------------------------------------------------
// Trip / boat utilization
// ---------------------------------------------------------------------------

export interface UtilizationBucket {
  date: string;
  passengers: number;
  capacity: number;
  occupancyPct: number;
}

/** Daily occupancy trend across all (non-cancelled) trips in range. */
export function getTripUtilizationTrend(database: Db | undefined, range: DateRange): UtilizationBucket[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT t.trip_date AS date, SUM(t.capacity) AS capacity,
              COALESCE((SELECT SUM(b.passenger_count) FROM bookings b WHERE b.trip_id = t.trip_id AND b.status IN ('confirmed','completed')), 0) AS passengers
       FROM trips t WHERE t.trip_date BETWEEN ? AND ? AND t.status != 'cancelled'
       GROUP BY t.trip_date ORDER BY t.trip_date`
    )
    .all(range.from, range.to) as { date: string; capacity: number; passengers: number }[];

  return rows.map((r) => ({ ...r, occupancyPct: pct(safeDiv(r.passengers, r.capacity)) }));
}

export interface BoatUtilization {
  vesselId: string;
  tripsRun: number; // status = 'completed'
  tripsScheduled: number; // all non-cancelled trips in range
  utilizationPct: number; // tripsRun / tripsScheduled
}

export function getBoatUtilization(database: Db | undefined, range: DateRange): BoatUtilization[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT vessel_id AS vesselId,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS tripsRun,
              SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) AS tripsScheduled
       FROM trips WHERE trip_date BETWEEN ? AND ? GROUP BY vessel_id`
    )
    .all(range.from, range.to) as { vesselId: string; tripsRun: number; tripsScheduled: number }[];

  return rows.map((r) => ({ ...r, utilizationPct: pct(safeDiv(r.tripsRun, r.tripsScheduled)) }));
}

// ---------------------------------------------------------------------------
// Crew efficiency: trips per crew member, and average guest rating of the
// captain on the trips they captained (directional correlation only — no
// statistical significance claimed for small samples).
// ---------------------------------------------------------------------------

export interface CrewEfficiency {
  crewId: string;
  fullName: string;
  role: string;
  tripsCrewed: number;
  avgCaptainRating: number | null; // only meaningful for role = 'captain'
}

export function getCrewEfficiency(database: Db | undefined, range: DateRange): CrewEfficiency[] {
  const d = resolveDb(database);
  const crew = d.prepare(`SELECT crew_id, full_name, role FROM crew`).all() as {
    crew_id: string;
    full_name: string;
    role: string;
  }[];

  const tripsCrewedStmt = d.prepare(
    `SELECT COUNT(*) AS n FROM trip_crew_assignments tca
     JOIN trips t ON t.trip_id = tca.trip_id
     WHERE tca.crew_id = ? AND t.trip_date BETWEEN ? AND ?`
  );

  const captainRatingStmt = d.prepare(
    `SELECT AVG(f.rating_captain) AS avg FROM feedback f
     JOIN trips t ON t.trip_id = f.trip_id
     WHERE t.captain_crew_id = ? AND t.trip_date BETWEEN ? AND ? AND f.rating_captain IS NOT NULL`
  );

  return crew.map((c) => {
    const tripsCrewed = (tripsCrewedStmt.get(c.crew_id, range.from, range.to) as { n: number }).n;
    const avgRatingRow = captainRatingStmt.get(c.crew_id, range.from, range.to) as { avg: number | null };
    return {
      crewId: c.crew_id,
      fullName: c.full_name,
      role: c.role,
      tripsCrewed,
      avgCaptainRating: avgRatingRow.avg !== null ? round2(avgRatingRow.avg) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Fuel burn trend & engine hours
// ---------------------------------------------------------------------------

export interface FuelBurnEntry {
  tripId: string;
  tripDate: string;
  litersConsumed: number;
  costInr: number;
  engineHours: number;
  distanceNm: number | null;
  litersPerEngineHour: number | null;
  costPerEngineHour: number | null;
  litersPerNm: number | null;
}

export function getFuelBurnTrend(database: Db | undefined, range: DateRange): FuelBurnEntry[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT fl.trip_id AS tripId, t.trip_date AS tripDate, fl.liters_consumed AS litersConsumed,
              fl.cost_inr AS costInr, fl.engine_hours AS engineHours, r.distance_nm AS distanceNm
       FROM fuel_logs fl JOIN trips t ON t.trip_id = fl.trip_id
       LEFT JOIN routes r ON r.route_id = t.route_id
       WHERE t.trip_date BETWEEN ? AND ? ORDER BY t.trip_date`
    )
    .all(range.from, range.to) as {
    tripId: string;
    tripDate: string;
    litersConsumed: number;
    costInr: number;
    engineHours: number;
    distanceNm: number | null;
  }[];

  return rows.map((r) => ({
    ...r,
    litersPerEngineHour: r.engineHours > 0 ? round2(r.litersConsumed / r.engineHours) : null,
    costPerEngineHour: r.engineHours > 0 ? round2(r.costInr / r.engineHours) : null,
    litersPerNm: r.distanceNm && r.distanceNm > 0 ? round2(r.litersConsumed / r.distanceNm) : null,
  }));
}

export function getEngineHoursAccumulation(
  database: Db | undefined,
  range: DateRange
): { vesselId: string; totalEngineHours: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT t.vessel_id AS vesselId, COALESCE(SUM(fl.engine_hours), 0) AS totalEngineHours
       FROM fuel_logs fl JOIN trips t ON t.trip_id = fl.trip_id
       WHERE t.trip_date BETWEEN ? AND ? GROUP BY t.vessel_id`
    )
    .all(range.from, range.to) as { vesselId: string; totalEngineHours: number }[];
  return rows.map((r) => ({ ...r, totalEngineHours: round2(r.totalEngineHours) }));
}

// ---------------------------------------------------------------------------
// Downtime (from maintenance_records)
// ---------------------------------------------------------------------------

export function getDowntimeByVessel(
  database: Db | undefined,
  range: DateRange
): { vesselId: string; downtimeHours: number; recordCount: number }[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT vessel_id AS vesselId, COALESCE(SUM(downtime_hours), 0) AS downtimeHours, COUNT(*) AS recordCount
       FROM maintenance_records WHERE maintenance_date BETWEEN ? AND ? GROUP BY vessel_id`
    )
    .all(range.from, range.to) as { vesselId: string; downtimeHours: number; recordCount: number }[];
  return rows.map((r) => ({ ...r, downtimeHours: round2(r.downtimeHours) }));
}

// ---------------------------------------------------------------------------
// True Asset Yield
// ---------------------------------------------------------------------------

export interface TrueAssetYield {
  vesselId: string;
  actualProfitInr: number;
  downtimeHours: number;
  opportunityCostInr: number;
  trueAssetYieldInr: number;
}

export function getTrueAssetYield(database: Db | undefined, range: DateRange): TrueAssetYield[] {
  const d = resolveDb(database);
  // We need profit per vessel, downtime per vessel, and peak revenue/passenger rate.
  // Peak Rev = max ticket_price_premium. Let's just use average ticket price for simplicity.
  // Opportunity cost = downtime_hours * (capacity * avg_ticket_price / 24) or similar.
  // Let's use a simpler heuristic: downtimeHours * average_hourly_revenue
  
  // 1. Profit per vessel
  const profitStmt = d.prepare(
    `SELECT t.vessel_id, 
            COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) - 
            COALESCE((SELECT SUM(amount_inr) FROM expenses e WHERE e.trip_id IN (SELECT trip_id FROM trips WHERE vessel_id = t.vessel_id AND trip_date BETWEEN ? AND ?)), 0) AS profit
     FROM trips t
     LEFT JOIN bookings b ON b.trip_id = t.trip_id
     LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
     WHERE t.trip_date BETWEEN ? AND ? AND t.status != 'cancelled'
     GROUP BY t.vessel_id`
  );
  const profits = profitStmt.all(range.from, range.to, range.from, range.to) as { vessel_id: string; profit: number }[];

  // 2. Average Hourly Revenue per vessel
  const hourlyRevStmt = d.prepare(
    `SELECT t.vessel_id, 
            COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) / 
            NULLIF(SUM(r.duration_hrs), 0) AS avgHourlyRev
     FROM trips t
     JOIN routes r ON r.route_id = t.route_id
     LEFT JOIN bookings b ON b.trip_id = t.trip_id
     LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
     WHERE t.trip_date BETWEEN ? AND ? AND t.status != 'cancelled'
     GROUP BY t.vessel_id`
  );
  const hourlyRevs = hourlyRevStmt.all(range.from, range.to) as { vessel_id: string; avgHourlyRev: number | null }[];
  
  const downtimes = getDowntimeByVessel(d, range);

  const results: TrueAssetYield[] = [];
  
  const vesselIds = new Set([...profits.map(p => p.vessel_id), ...downtimes.map(d => d.vesselId)]);
  
  for (const vesselId of vesselIds) {
    const profit = profits.find(p => p.vessel_id === vesselId)?.profit || 0;
    const downtime = downtimes.find(d => d.vesselId === vesselId)?.downtimeHours || 0;
    const avgHourlyRev = hourlyRevs.find(h => h.vessel_id === vesselId)?.avgHourlyRev || 0;
    
    const opportunityCost = downtime * avgHourlyRev;
    const trueYield = profit - opportunityCost;
    
    results.push({
      vesselId,
      actualProfitInr: roundInt(profit),
      downtimeHours: downtime,
      opportunityCostInr: roundInt(opportunityCost),
      trueAssetYieldInr: roundInt(trueYield),
    });
  }
  
  return results;
}

export { roundInt };
