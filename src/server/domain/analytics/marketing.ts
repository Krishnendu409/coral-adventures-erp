import type { Db, DateRange } from "./shared";
import {
  db as resolveDb,
  safeDiv,
  round2,
  roundInt,
  pct,
  daysBetween,
  getParam,
  computeWeightedAvgTicketPrice,
  computeAnnualFixedOpex,
  computeTotalOpDays,
} from "./shared";

/**
 * Marketing Intelligence + Marketing Planning System
 * (CLAUDE.md Phase 6 "Marketing Intelligence" and Phase 7 "Marketing
 * Planning System"). Everything here reads marketing_channels (35 real
 * channels with real capture/lead/conversion/repeat/referral rates) as
 * config, and computes every KPI live from campaigns/leads/customers/
 * bookings/payments.
 */

export interface MarketingChannel {
  channelId: string;
  category: string;
  name: string;
  reachablePersonsYear: number | null;
  reachPct: number | null;
  activeMonths: number | null;
  captureRate: number | null;
  leadRate: number | null;
  conversionRate: number | null;
  repeatRate: number | null;
  referralRate: number | null; // referrals PER CUSTOMER (e.g. 1.5), not a percentage
  avgGroupSize: number | null;
  plannedAnnualSpendInr: number | null;
  isActive: boolean;
}

function rowToChannel(r: Record<string, unknown>): MarketingChannel {
  return {
    channelId: r.channel_id as string,
    category: r.category as string,
    name: r.name as string,
    reachablePersonsYear: r.reachable_persons_year as number | null,
    reachPct: r.reach_pct as number | null,
    activeMonths: r.active_months as number | null,
    captureRate: r.capture_rate as number | null,
    leadRate: r.lead_rate as number | null,
    conversionRate: r.conversion_rate as number | null,
    repeatRate: r.repeat_rate as number | null,
    referralRate: r.referral_rate as number | null,
    avgGroupSize: r.avg_group_size as number | null,
    plannedAnnualSpendInr: r.planned_annual_spend_inr as number | null,
    isActive: (r.is_active as number) === 1,
  };
}

export function getChannel(database: Db, channelId: string): MarketingChannel {
  const row = database.prepare(`SELECT * FROM marketing_channels WHERE channel_id = ?`).get(channelId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error(`marketing: unknown channel_id '${channelId}'`);
  return rowToChannel(row);
}

export function getActiveChannels(database: Db): MarketingChannel[] {
  const rows = database.prepare(`SELECT * FROM marketing_channels WHERE is_active = 1`).all() as Record<
    string,
    unknown
  >[];
  return rows.map(rowToChannel);
}

// ---------------------------------------------------------------------------
// Spend: prefer real campaigns.actual_spend_inr for the channel in-range;
// fall back to marketing_channels.planned_annual_spend_inr prorated by the
// number of days in the range (out of 365), documented explicitly since it
// is an assumption-based fallback, not a fact.
// ---------------------------------------------------------------------------

export interface SpendResult {
  spendInr: number;
  source: "actual_campaigns" | "prorated_planned_spend" | "none";
}

export function getChannelSpend(database: Db, channelId: string, range: DateRange): SpendResult {
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(actual_spend_inr), 0) AS total, COUNT(*) AS n FROM campaigns
       WHERE channel_id = ? AND start_date BETWEEN ? AND ?`
    )
    .get(channelId, range.from, range.to) as { total: number; n: number };

  if (row.n > 0 && row.total > 0) {
    return { spendInr: roundInt(row.total), source: "actual_campaigns" };
  }

  const channel = getChannel(database, channelId);
  if (!channel.plannedAnnualSpendInr) return { spendInr: 0, source: "none" };

  const days = daysBetween(range.from, range.to) + 1;
  const prorated = channel.plannedAnnualSpendInr * (days / 365);
  return { spendInr: roundInt(prorated), source: "prorated_planned_spend" };
}

// ---------------------------------------------------------------------------
// CAC: spend / new customers acquired via the channel in range. "Acquired"
// is approximated by customers.first_trip_date falling inside the range,
// since the schema has no separate customer-creation timestamp.
// ---------------------------------------------------------------------------

export interface CacResult {
  channelId: string;
  range: DateRange;
  spendInr: number;
  spendSource: SpendResult["source"];
  newCustomers: number;
  cacInr: number | null;
}

export function computeCac(database: Db, channelId: string, range: DateRange): CacResult {
  const spend = getChannelSpend(database, channelId, range);
  const row = database
    .prepare(
      `SELECT COUNT(*) AS n FROM customers
       WHERE acquisition_channel_id = ? AND first_trip_date BETWEEN ? AND ?`
    )
    .get(channelId, range.from, range.to) as { n: number };

  return {
    channelId,
    range,
    spendInr: spend.spendInr,
    spendSource: spend.source,
    newCustomers: row.n,
    cacInr: row.n > 0 ? round2(safeDiv(spend.spendInr, row.n)) : null,
  };
}

// ---------------------------------------------------------------------------
// LTV: lifetime revenue (all bookings, all time) for customers acquired via
// a channel, averaged two ways: per all acquired customers (includes
// zero-booking customers, i.e. true acquisition efficiency) and per paying
// customer (only those who actually transacted).
// ---------------------------------------------------------------------------

export interface LtvResult {
  channelId: string;
  acquiredCustomers: number;
  payingCustomers: number;
  totalLifetimeRevenueInr: number;
  ltvPerAcquiredCustomerInr: number | null;
  ltvPerPayingCustomerInr: number | null;
}

export function computeLtv(database: Db, channelId: string): LtvResult {
  const acquired = database
    .prepare(`SELECT COUNT(*) AS n FROM customers WHERE acquisition_channel_id = ?`)
    .get(channelId) as { n: number };

  const revenueRow = database
    .prepare(
      `SELECT COUNT(DISTINCT c.customer_id) AS payingCustomers,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS totalRevenue
       FROM customers c
       JOIN bookings b ON b.customer_id = c.customer_id
       JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
       WHERE c.acquisition_channel_id = ?`
    )
    .get(channelId) as { payingCustomers: number; totalRevenue: number };

  return {
    channelId,
    acquiredCustomers: acquired.n,
    payingCustomers: revenueRow.payingCustomers,
    totalLifetimeRevenueInr: roundInt(revenueRow.totalRevenue),
    ltvPerAcquiredCustomerInr: acquired.n > 0 ? round2(safeDiv(revenueRow.totalRevenue, acquired.n)) : null,
    ltvPerPayingCustomerInr:
      revenueRow.payingCustomers > 0 ? round2(safeDiv(revenueRow.totalRevenue, revenueRow.payingCustomers)) : null,
  };
}

// ---------------------------------------------------------------------------
// ROI (range-scoped): revenue attributed to bookings placed through the
// channel (via bookings.channel_id, payments received in range) minus spend
// in range, over spend.
// ---------------------------------------------------------------------------

export interface RoiResult {
  channelId: string;
  range: DateRange;
  revenueInr: number;
  spendInr: number;
  netProfitInr: number;
  roiPct: number | null; // (revenue - spend) / spend, as a percentage
}

export function computeRoi(database: Db, channelId: string, range: DateRange): RoiResult {
  const spend = getChannelSpend(database, channelId, range);
  const revenueRow = database
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS net
       FROM payments p JOIN bookings b ON b.booking_id = p.booking_id
       WHERE p.status = 'completed' AND p.payment_date BETWEEN ? AND ? AND b.channel_id = ?`
    )
    .get(range.from, range.to, channelId) as { net: number };

  const netProfit = revenueRow.net - spend.spendInr;
  return {
    channelId,
    range,
    revenueInr: roundInt(revenueRow.net),
    spendInr: spend.spendInr,
    netProfitInr: roundInt(netProfit),
    roiPct: spend.spendInr > 0 ? pct(safeDiv(netProfit, spend.spendInr)) : null,
  };
}

// ---------------------------------------------------------------------------
// Referral rate (actual vs assumed). Assumed referralRate on the channel row
// is "referrals per customer" (e.g. 1.5), not a 0..1 rate.
// ---------------------------------------------------------------------------

export interface ReferralRateResult {
  channelId: string;
  customersAcquired: number;
  referredCustomersGenerated: number;
  actualReferralsPerCustomer: number | null;
  assumedReferralsPerCustomer: number | null;
}

export function computeReferralRate(database: Db, channelId: string): ReferralRateResult {
  const acquired = database
    .prepare(`SELECT COUNT(*) AS n FROM customers WHERE acquisition_channel_id = ?`)
    .get(channelId) as { n: number };

  const referred = database
    .prepare(
      `SELECT COUNT(*) AS n FROM customers
       WHERE referred_by_customer_id IN (SELECT customer_id FROM customers WHERE acquisition_channel_id = ?)`
    )
    .get(channelId) as { n: number };

  const channel = getChannel(database, channelId);

  return {
    channelId,
    customersAcquired: acquired.n,
    referredCustomersGenerated: referred.n,
    actualReferralsPerCustomer: acquired.n > 0 ? round2(safeDiv(referred.n, acquired.n)) : null,
    assumedReferralsPerCustomer: channel.referralRate,
  };
}

// ---------------------------------------------------------------------------
// Repeat customer rate: % of customers with > 1 completed booking.
// ---------------------------------------------------------------------------

export function computeRepeatCustomerRate(database: Db, channelId?: string): { totalCustomers: number; repeatCustomers: number; repeatRatePct: number | null } {
  const channelFilter = channelId ? `WHERE c.acquisition_channel_id = ?` : "";
  const params = channelId ? [channelId] : [];

  const rows = database
    .prepare(
      `SELECT c.customer_id AS customerId, COUNT(b.booking_id) AS completedBookings
       FROM customers c LEFT JOIN bookings b ON b.customer_id = c.customer_id AND b.status = 'completed'
       ${channelFilter}
       GROUP BY c.customer_id`
    )
    .all(...params) as { customerId: string; completedBookings: number }[];

  const totalCustomers = rows.length;
  const repeatCustomers = rows.filter((r) => r.completedBookings > 1).length;
  return {
    totalCustomers,
    repeatCustomers,
    repeatRatePct: totalCustomers > 0 ? pct(safeDiv(repeatCustomers, totalCustomers)) : null,
  };
}

// ---------------------------------------------------------------------------
// Booking funnel (leads.status), optionally scoped to a channel.
// ---------------------------------------------------------------------------

export interface BookingFunnel {
  range: DateRange;
  channelId: string | null;
  byStatus: Record<string, number>;
  totalLeads: number;
  convertedLeads: number;
  conversionRatePct: number | null;
}

export function getBookingFunnel(database: Db, range: DateRange, channelId?: string): BookingFunnel {
  const channelFilter = channelId ? `AND channel_id = ?` : "";
  const params: (string | number)[] = channelId ? [range.from, range.to, channelId] : [range.from, range.to];

  const rows = database
    .prepare(
      `SELECT status, COUNT(*) AS n FROM leads WHERE captured_date BETWEEN ? AND ? ${channelFilter} GROUP BY status`
    )
    .all(...params) as { status: string; n: number }[];

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.n;
    total += r.n;
  }
  const converted = byStatus["converted"] ?? 0;

  return {
    range,
    channelId: channelId ?? null,
    byStatus,
    totalLeads: total,
    convertedLeads: converted,
    conversionRatePct: total > 0 ? pct(safeDiv(converted, total)) : null,
  };
}

// ---------------------------------------------------------------------------
// Channel attribution: revenue / profit / passenger share by bookings.channel_id
// ---------------------------------------------------------------------------

export interface ChannelAttribution {
  channelId: string | null;
  revenueInr: number;
  passengers: number;
  variableCostInr: number;
  profitInr: number;
  passengerSharePct: number; // this channel's passengers / total passengers across all channels in range
}

export function getChannelAttribution(database: Db, range: DateRange): ChannelAttribution[] {
  const varCostPerPax = getParam(database, "var_cost_per_pax");

  const rows = database
    .prepare(
      `SELECT b.channel_id AS channelId,
              COALESCE(SUM(b.passenger_count), 0) AS passengers,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS revenueInr
       FROM bookings b
       LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed' AND p.payment_date BETWEEN ? AND ?
       WHERE b.booking_date BETWEEN ? AND ? AND b.status IN ('confirmed', 'completed')
       GROUP BY b.channel_id`
    )
    .all(range.from, range.to, range.from, range.to) as { channelId: string | null; passengers: number; revenueInr: number }[];

  const totalPassengers = rows.reduce((sum, r) => sum + r.passengers, 0);

  return rows.map((r) => {
    const variableCostInr = roundInt(r.passengers * varCostPerPax);
    return {
      channelId: r.channelId,
      revenueInr: roundInt(r.revenueInr),
      passengers: r.passengers,
      variableCostInr,
      profitInr: roundInt(r.revenueInr - variableCostInr),
      passengerSharePct: pct(safeDiv(r.passengers, totalPassengers)),
    };
  });
}

// ---------------------------------------------------------------------------
// Break-even analysis
// ---------------------------------------------------------------------------

export interface BreakEvenAnalysis {
  annualFixedCostsInr: number;
  avgRevenuePerBookingInr: number;
  avgPassengersPerBooking: number;
  variableCostPerBookingInr: number;
  contributionMarginPerBookingInr: number;
  breakEvenBookingsPerYear: number | null;
  breakEvenOccupancyPct: number | null;
  basis: "actual_trailing_90d" | "assumption_based";
}

/** Uses actual booking/payment averages from the trailing 90 days if any
 * exist; otherwise falls back to the assumption-based blended ticket price
 * and channel-average group size (documented — this only fires before any
 * real trip history exists). */
export function getBreakEvenAnalysis(database: Db, asOf: string): BreakEvenAnalysis {
  const from = new Date(asOf + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 90);
  const range: DateRange = { from: from.toISOString().slice(0, 10), to: asOf };

  const annualFixedCostsInr = roundInt(computeAnnualFixedOpex(database));
  const varCostPerPax = getParam(database, "var_cost_per_pax");

  const actualRow = database
    .prepare(
      `SELECT COUNT(DISTINCT b.booking_id) AS bookingCount,
              COALESCE(SUM(b.passenger_count), 0) AS totalPassengers,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS totalRevenue
       FROM bookings b JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
       WHERE b.booking_date BETWEEN ? AND ?`
    )
    .get(range.from, range.to) as { bookingCount: number; totalPassengers: number; totalRevenue: number };

  let avgRevenuePerBookingInr: number;
  let avgPassengersPerBooking: number;
  let basis: BreakEvenAnalysis["basis"];

  if (actualRow.bookingCount > 0) {
    avgRevenuePerBookingInr = round2(actualRow.totalRevenue / actualRow.bookingCount);
    avgPassengersPerBooking = round2(actualRow.totalPassengers / actualRow.bookingCount);
    basis = "actual_trailing_90d";
  } else {
    const channels = getActiveChannels(database).filter((c) => c.avgGroupSize);
    const avgGroupSize = channels.length
      ? channels.reduce((sum, c) => sum + (c.avgGroupSize ?? 0), 0) / channels.length
      : 1;
    const onboardRevPerPax = getParam(database, "onboard_rev_pax");
    const avgTicketPrice = computeWeightedAvgTicketPrice(database);
    avgPassengersPerBooking = round2(avgGroupSize);
    avgRevenuePerBookingInr = round2((avgTicketPrice + onboardRevPerPax) * avgGroupSize);
    basis = "assumption_based";
  }

  const variableCostPerBookingInr = round2(avgPassengersPerBooking * varCostPerPax);
  const contributionMarginPerBookingInr = round2(avgRevenuePerBookingInr - variableCostPerBookingInr);

  const breakEvenBookingsPerYear =
    contributionMarginPerBookingInr > 0 ? Math.ceil(annualFixedCostsInr / contributionMarginPerBookingInr) : null;

  const vesselCapacity = getParam(database, "vessel_capacity");
  const tripsPerDay = getParam(database, "trips_per_day");
  const totalOpDays = computeTotalOpDays(database);
  const annualSeatCapacity = vesselCapacity * tripsPerDay * totalOpDays;

  const breakEvenOccupancyPct =
    breakEvenBookingsPerYear !== null
      ? pct(safeDiv(breakEvenBookingsPerYear * avgPassengersPerBooking, annualSeatCapacity))
      : null;

  return {
    annualFixedCostsInr,
    avgRevenuePerBookingInr,
    avgPassengersPerBooking,
    variableCostPerBookingInr,
    contributionMarginPerBookingInr,
    breakEvenBookingsPerYear,
    breakEvenOccupancyPct,
    basis,
  };
}

// ---------------------------------------------------------------------------
// Campaign comparison
// ---------------------------------------------------------------------------

export interface CampaignComparison {
  campaignId: string;
  name: string;
  channelId: string;
  status: string;
  budgetInr: number;
  actualSpendInr: number;
  budgetVarianceInr: number;
  bookingsGenerated: number;
  revenueGeneratedInr: number;
}

export function getCampaignComparison(database: Db, range: DateRange): CampaignComparison[] {
  const campaigns = database
    .prepare(
      `SELECT campaign_id, name, channel_id, status, budget_inr, actual_spend_inr
       FROM campaigns WHERE start_date BETWEEN ? AND ?`
    )
    .all(range.from, range.to) as {
    campaign_id: string;
    name: string;
    channel_id: string;
    status: string;
    budget_inr: number;
    actual_spend_inr: number;
  }[];

  const bookingsStmt = database.prepare(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM((SELECT COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0)
                          FROM payments p WHERE p.booking_id = l.converted_booking_id AND p.status = 'completed')), 0) AS revenue
     FROM leads l WHERE l.campaign_id = ? AND l.status = 'converted' AND l.converted_booking_id IS NOT NULL`
  );

  return campaigns.map((c) => {
    const b = bookingsStmt.get(c.campaign_id) as { n: number; revenue: number };
    return {
      campaignId: c.campaign_id,
      name: c.name,
      channelId: c.channel_id,
      status: c.status,
      budgetInr: c.budget_inr,
      actualSpendInr: c.actual_spend_inr,
      budgetVarianceInr: c.actual_spend_inr - c.budget_inr,
      bookingsGenerated: b.n,
      revenueGeneratedInr: roundInt(b.revenue),
    };
  });
}

// ---------------------------------------------------------------------------
// Marketing Planning System (CLAUDE.md Phase 7): footfall -> capture -> leads
// -> conversion -> passengers -> revenue -> profit -> ROI -> recommendation.
// Three-stage funnel matching the real marketing_channels columns:
//   footfall --(capture_rate)--> captured/interested
//           --(lead_rate)------> leads
//           --(conversion_rate)-> converted bookings
//           * avg_group_size ---> passengers
// ---------------------------------------------------------------------------

export interface FunnelProjection {
  channelId: string;
  footfallInput: number;
  captured: number;
  leads: number;
  convertedBookings: number;
  passengers: number;
  revenueInr: number;
  variableCostInr: number;
  grossProfitInr: number;
  spendInr: number;
  netProfitInr: number;
  roiPct: number | null;
}

interface FunnelInputs {
  basePriceInr: number;
  onboardRevPerPaxInr: number;
  varCostPerPaxInr: number;
}

function resolveFunnelInputs(database: Db, cruiseTypeId?: string): FunnelInputs {
  const onboardRevPerPaxInr = getParam(database, "onboard_rev_pax");
  const varCostPerPaxInr = getParam(database, "var_cost_per_pax");
  let basePriceInr: number;
  if (cruiseTypeId) {
    const row = database.prepare(`SELECT base_price_inr FROM cruise_types WHERE cruise_type_id = ?`).get(cruiseTypeId) as
      | { base_price_inr: number }
      | undefined;
    if (!row) throw new Error(`marketing: unknown cruise_type_id '${cruiseTypeId}'`);
    basePriceInr = row.base_price_inr;
  } else {
    basePriceInr = computeWeightedAvgTicketPrice(database);
  }
  return { basePriceInr, onboardRevPerPaxInr, varCostPerPaxInr };
}

/**
 * Projects a channel's funnel for a given footfall/reach number, using the
 * channel's real capture_rate / lead_rate / conversion_rate / avg_group_size.
 * `efficiencyMultiplier` (default 1.0) scales the combined funnel efficiency
 * (capture*lead*conversion) uniformly — see scenarioAnalysis below.
 */
export function projectChannelFunnel(
  database: Db,
  channelId: string,
  footfall: number,
  options: { cruiseTypeId?: string; spendInr?: number; efficiencyMultiplier?: number } = {}
): FunnelProjection {
  const channel = getChannel(database, channelId);
  const { basePriceInr, onboardRevPerPaxInr, varCostPerPaxInr } = resolveFunnelInputs(database, options.cruiseTypeId);
  const multiplier = options.efficiencyMultiplier ?? 1;

  const captureRate = channel.captureRate ?? 0;
  const leadRate = channel.leadRate ?? 0;
  const conversionRate = channel.conversionRate ?? 0;
  const avgGroupSize = channel.avgGroupSize ?? 1;

  const captured = footfall * captureRate;
  const leads = captured * leadRate;
  const convertedBookings = leads * conversionRate * multiplier;
  const passengers = convertedBookings * avgGroupSize;

  const revenueInr = passengers * (basePriceInr + onboardRevPerPaxInr);
  const variableCostInr = passengers * varCostPerPaxInr;
  const grossProfitInr = revenueInr - variableCostInr;
  const spendInr = options.spendInr ?? channel.plannedAnnualSpendInr ?? 0;
  const netProfitInr = grossProfitInr - spendInr;

  return {
    channelId,
    footfallInput: footfall,
    captured: round2(captured),
    leads: round2(leads),
    convertedBookings: round2(convertedBookings),
    passengers: round2(passengers),
    revenueInr: roundInt(revenueInr),
    variableCostInr: roundInt(variableCostInr),
    grossProfitInr: roundInt(grossProfitInr),
    spendInr: roundInt(spendInr),
    netProfitInr: roundInt(netProfitInr),
    roiPct: spendInr > 0 ? pct(safeDiv(netProfitInr, spendInr)) : null,
  };
}

// Scenario multipliers applied to the combined funnel efficiency
// (capture_rate * lead_rate * conversion_rate). These are judgment calls,
// not measured data — documented here so they're easy to challenge:
//   conservative: 0.7x   (execution risk, weaker-than-planned targeting)
//   expected:     1.0x   (channel performs exactly as assumed)
//   aggressive:   1.3x   (favorable season / good creative / faster ramp)
//   best case:    1.6x   (viral/referral spillover, best-case market conditions)
export const SCENARIO_MULTIPLIERS = {
  conservative: 0.7,
  expected: 1.0,
  aggressive: 1.3,
  bestCase: 1.6,
} as const;

export type ScenarioName = keyof typeof SCENARIO_MULTIPLIERS;

export function scenarioAnalysis(
  database: Db,
  channelId: string,
  footfall: number,
  options: { cruiseTypeId?: string; spendInr?: number } = {}
): Record<ScenarioName, FunnelProjection> {
  const result = {} as Record<ScenarioName, FunnelProjection>;
  for (const [name, multiplier] of Object.entries(SCENARIO_MULTIPLIERS) as [ScenarioName, number][]) {
    result[name] = projectChannelFunnel(database, channelId, footfall, { ...options, efficiencyMultiplier: multiplier });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Budget allocation: rank active channels by projected ROI (at their planned
// annual spend, using reachable_persons_year * reach_pct as the footfall
// basis) and greedily fund the highest-ROI channels first, capped at each
// channel's own planned_annual_spend_inr (a sensible ceiling — we don't
// assume a channel can usefully absorb unlimited spend).
// ---------------------------------------------------------------------------

export interface BudgetAllocationEntry {
  channelId: string;
  name: string;
  projectedRoiPct: number | null;
  capInr: number;
  allocatedInr: number;
  rationale: string;
}

export function recommendBudgetAllocation(database: Db, totalBudgetInr: number): BudgetAllocationEntry[] {
  const channels = getActiveChannels(database).filter((c) => (c.plannedAnnualSpendInr ?? 0) > 0);

  const ranked = channels
    .map((c) => {
      const footfallBasis = (c.reachablePersonsYear ?? 0) * (c.reachPct ?? 1);
      const projection = projectChannelFunnel(database, c.channelId, footfallBasis, {
        spendInr: c.plannedAnnualSpendInr ?? 0,
      });
      return { channel: c, projection };
    })
    .sort((a, b) => (b.projection.roiPct ?? -Infinity) - (a.projection.roiPct ?? -Infinity));

  let remaining = totalBudgetInr;
  const allocations: BudgetAllocationEntry[] = [];

  ranked.forEach(({ channel, projection }, index) => {
    const cap = channel.plannedAnnualSpendInr ?? 0;
    const allocated = remaining > 0 ? Math.min(remaining, cap) : 0;
    remaining -= allocated;

    const roiText = projection.roiPct !== null ? `${projection.roiPct}% projected ROI` : "ROI undetermined (no spend basis)";
    const rationale =
      allocated > 0
        ? `Ranked #${index + 1} by ${roiText}. Funded ${allocated === cap ? "in full" : "partially"} up to its planned annual spend cap of ₹${cap.toLocaleString("en-IN")}.`
        : `Ranked #${index + 1} by ${roiText}. No budget remaining by the time this channel was reached.`;

    allocations.push({
      channelId: channel.channelId,
      name: channel.name,
      projectedRoiPct: projection.roiPct,
      capInr: cap,
      allocatedInr: roundInt(allocated),
      rationale,
    });
  });

  return allocations;
}
