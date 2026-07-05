import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, pct, getParam, computeAnnualFixedOpex, computeWeightedAvgTicketPrice, computeTotalOpDays } from "./shared";

// ---------------------------------------------------------------------------
// Expansion & Seasonality Intelligence
// ---------------------------------------------------------------------------

export interface SeasonalityMetrics {
  season: 'peak' | 'shoulder' | 'offseason';
  revenueInr: number;
  variableCostInr: number;
  fixedCostAllocationInr: number; // Allocated proportionally by days
  profitInr: number;
  marginPct: number | null;
}

export function getSeasonalityMetrics(database: Db | undefined, range: DateRange): SeasonalityMetrics[] {
  const d = resolveDb(database);
  
  // This is a simplified seasonality model. In a real application, you'd map specific months to seasons.
  // For now, we'll allocate actuals based on assumed days.
  
  const opDaysPeak = getParam(d, "op_days_peak");
  const opDaysShoulder = getParam(d, "op_days_shoulder");
  const opDaysOffseason = getParam(d, "op_days_offseason");
  const totalOpDays = computeTotalOpDays(d);
  
  const annualFixedOpexInr = computeAnnualFixedOpex(d);
  const varCostPerPax = getParam(d, "var_cost_per_pax");
  
  // We'll split the total range revenue/passengers by a heuristic, or ideally read from actual trips grouped by month->season mapping.
  // Here we'll do a simple month->season mapping (e.g., Peak: Dec-Feb, Shoulder: Oct-Nov, Mar-May, Offseason: Jun-Sep).
  
  const rows = d.prepare(`
    SELECT t.trip_date, 
           COALESCE(SUM(b.passenger_count), 0) AS passengers,
           COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS revenue
    FROM trips t
    LEFT JOIN bookings b ON b.trip_id = t.trip_id AND b.status IN ('confirmed', 'completed')
    LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
    WHERE t.trip_date BETWEEN ? AND ? AND t.status != 'cancelled'
    GROUP BY t.trip_date
  `).all(range.from, range.to) as { trip_date: string; passengers: number; revenue: number }[];

  let peakRev = 0, peakPax = 0, peakDays = 0;
  let shoulderRev = 0, shoulderPax = 0, shoulderDays = 0;
  let offseasonRev = 0, offseasonPax = 0, offseasonDays = 0;

  for (const r of rows) {
    const month = parseInt(r.trip_date.split('-')[1]!, 10);
    // Peak: 12, 1, 2. Shoulder: 10, 11, 3, 4, 5. Offseason: 6, 7, 8, 9
    if (month === 12 || month === 1 || month === 2) {
      peakRev += r.revenue; peakPax += r.passengers; peakDays++;
    } else if (month >= 6 && month <= 9) {
      offseasonRev += r.revenue; offseasonPax += r.passengers; offseasonDays++;
    } else {
      shoulderRev += r.revenue; shoulderPax += r.passengers; shoulderDays++;
    }
  }

  const mapToResult = (season: 'peak' | 'shoulder' | 'offseason', rev: number, pax: number, actualDays: number, assumedDaysYearly: number) => {
    const variableCostInr = pax * varCostPerPax;
    // Fixed cost allocation based on proportion of assumed days
    const fixedCostAllocationInr = totalOpDays > 0 ? (assumedDaysYearly / totalOpDays) * annualFixedOpexInr * (actualDays / Math.max(assumedDaysYearly, 1)) : 0;
    
    // Simplification for the dashboard: just use the total fixed cost proportion for the date range
    const rangeDays = peakDays + shoulderDays + offseasonDays || 1;
    const actualFixedAllocation = (actualDays / rangeDays) * (annualFixedOpexInr * (rangeDays / 365));

    const profitInr = rev - variableCostInr - actualFixedAllocation;
    return {
      season,
      revenueInr: roundInt(rev),
      variableCostInr: roundInt(variableCostInr),
      fixedCostAllocationInr: roundInt(actualFixedAllocation),
      profitInr: roundInt(profitInr),
      marginPct: rev > 0 ? pct(safeDiv(profitInr, rev)) : null,
    };
  };

  return [
    mapToResult('peak', peakRev, peakPax, peakDays, opDaysPeak),
    mapToResult('shoulder', shoulderRev, shoulderPax, shoulderDays, opDaysShoulder),
    mapToResult('offseason', offseasonRev, offseasonPax, offseasonDays, opDaysOffseason),
  ];
}

export interface FleetExpansionROI {
  newVesselCapacity: number;
  newVesselCostInr: number;
  projectedAnnualRevenueInr: number;
  projectedAnnualOpexInr: number;
  projectedAnnualProfitInr: number;
  paybackPeriodYears: number | null;
  roiPct: number | null;
}

export function getFleetExpansionROI(database: Db | undefined, newVesselCapacity: number = 100, newVesselCostInr: number = 150000000): FleetExpansionROI {
  const d = resolveDb(database);
  
  // Uses base metrics to project performance of a new vessel
  const avgTicketPriceInr = computeWeightedAvgTicketPrice(d);
  const onboardRevPerPax = getParam(d, "onboard_rev_pax");
  const varCostPerPax = getParam(d, "var_cost_per_pax");
  
  const tripsPerDay = getParam(d, "trips_per_day");
  const totalOpDays = computeTotalOpDays(d);
  
  // Assuming 60% blended occupancy
  const assumedOccupancy = 0.6;
  const annualPax = newVesselCapacity * tripsPerDay * totalOpDays * assumedOccupancy;
  
  const projectedAnnualRevenueInr = annualPax * (avgTicketPriceInr + onboardRevPerPax);
  
  // Marginal Opex (Variable + additional fixed, assuming 20% overhead increase for a new boat)
  const additionalFixedOpex = computeAnnualFixedOpex(d) * 0.2; 
  const projectedAnnualOpexInr = (annualPax * varCostPerPax) + additionalFixedOpex;
  
  const projectedAnnualProfitInr = projectedAnnualRevenueInr - projectedAnnualOpexInr;
  
  const paybackPeriodYears = projectedAnnualProfitInr > 0 ? newVesselCostInr / projectedAnnualProfitInr : null;
  const roiPct = newVesselCostInr > 0 ? pct(safeDiv(projectedAnnualProfitInr, newVesselCostInr)) : null;

  return {
    newVesselCapacity,
    newVesselCostInr,
    projectedAnnualRevenueInr: roundInt(projectedAnnualRevenueInr),
    projectedAnnualOpexInr: roundInt(projectedAnnualOpexInr),
    projectedAnnualProfitInr: roundInt(projectedAnnualProfitInr),
    paybackPeriodYears: paybackPeriodYears ? round2(paybackPeriodYears) : null,
    roiPct,
  };
}
