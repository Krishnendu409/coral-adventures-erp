import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, pct, getParam } from "./shared";

// ---------------------------------------------------------------------------
// Event Intelligence
// ---------------------------------------------------------------------------

export interface EventProfitability {
  type: 'Corporate Event' | 'Standard Trip';
  tripCount: number;
  totalRevenueInr: number;
  totalVariableCostInr: number;
  avgProfitPerTripInr: number | null;
  avgMarginPct: number | null;
}

export function getEventProfitability(database: Db | undefined, range: DateRange): EventProfitability[] {
  const d = resolveDb(database);
  
  const varCostPerPax = getParam(d, "var_cost_per_pax");
  
  // Categorize by cruise_types.name containing 'Corporate' or 'Event' vs others
  const rows = d.prepare(`
    SELECT t.trip_id, ct.name as cruise_type_name,
           COALESCE(SUM(b.passenger_count), 0) AS passengers,
           COALESCE((SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END) 
                     FROM payments p JOIN bookings b2 ON p.booking_id = b2.booking_id WHERE b2.trip_id = t.trip_id AND p.status = 'completed'), 0) AS revenue
    FROM trips t
    JOIN cruise_types ct ON ct.cruise_type_id = t.cruise_type_id
    LEFT JOIN bookings b ON b.trip_id = t.trip_id AND b.status IN ('confirmed', 'completed')
    WHERE t.trip_date BETWEEN ? AND ? AND t.status != 'cancelled'
    GROUP BY t.trip_id, ct.name
  `).all(range.from, range.to) as { trip_id: string; cruise_type_name: string; passengers: number; revenue: number }[];

  let eventTrips = 0, eventRev = 0, eventVarCost = 0;
  let standardTrips = 0, standardRev = 0, standardVarCost = 0;

  for (const r of rows) {
    const isEvent = r.cruise_type_name.toLowerCase().includes('corporate') || r.cruise_type_name.toLowerCase().includes('event');
    const varCost = r.passengers * varCostPerPax;
    
    if (isEvent) {
      eventTrips++;
      eventRev += r.revenue;
      eventVarCost += varCost;
    } else {
      standardTrips++;
      standardRev += r.revenue;
      standardVarCost += varCost;
    }
  }

  const mapToResult = (type: 'Corporate Event' | 'Standard Trip', trips: number, rev: number, varCost: number) => {
    const profit = rev - varCost;
    return {
      type,
      tripCount: trips,
      totalRevenueInr: roundInt(rev),
      totalVariableCostInr: roundInt(varCost),
      avgProfitPerTripInr: trips > 0 ? roundInt(profit / trips) : null,
      avgMarginPct: rev > 0 ? pct(safeDiv(profit, rev)) : null,
    };
  };

  return [
    mapToResult('Corporate Event', eventTrips, eventRev, eventVarCost),
    mapToResult('Standard Trip', standardTrips, standardRev, standardVarCost)
  ];
}
