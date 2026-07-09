import type { Db, DateRange } from "./shared";
import { db as resolveDb, safeDiv, round2, roundInt, pct, computeNps, monthBucket, daysBetween } from "./shared";

/**
 * Customer Intelligence (CLAUDE.md Phase 6 "Customer Intelligence").
 * LTV, segmentation, VIP detection, referral trees, cancellation behaviour,
 * feedback/NPS trends — all computed live from customers/bookings/payments/
 * feedback rows.
 */

export interface CustomerLtv {
  customerId: string;
  fullName: string;
  completedBookings: number;
  totalSpendInr: number;
  firstTripDate: string | null;
  lastBookingDate: string | null;
}

/** Per-customer lifetime value (all-time revenue net of refunds, across
 * every completed-payment booking, regardless of date). */
export function getCustomerLtvTable(database?: Db): CustomerLtv[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT c.customer_id AS customerId, c.full_name AS fullName, c.first_trip_date AS firstTripDate,
              COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.booking_id END) AS completedBookings,
              MAX(b.booking_date) AS lastBookingDate,
              COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount_inr ELSE p.amount_inr END), 0) AS totalSpendInr
       FROM customers c
       LEFT JOIN bookings b ON b.customer_id = c.customer_id
       LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'completed'
       GROUP BY c.customer_id`
    )
    .all() as CustomerLtv[];
  return rows.map((r) => ({ ...r, totalSpendInr: roundInt(r.totalSpendInr) }));
}

export function getAverageLtv(database?: Db): { avgLtvAllCustomersInr: number; avgLtvPayingCustomersInr: number | null } {
  const rows = getCustomerLtvTable(database);
  const paying = rows.filter((r) => r.totalSpendInr > 0);
  return {
    avgLtvAllCustomersInr: rows.length ? round2(rows.reduce((s, r) => s + r.totalSpendInr, 0) / rows.length) : 0,
    avgLtvPayingCustomersInr: paying.length ? round2(paying.reduce((s, r) => s + r.totalSpendInr, 0) / paying.length) : null,
  };
}

// ---------------------------------------------------------------------------
// Segmentation: simple RFM-lite buckets.
//   Recency: days since lastBookingDate (relative to asOf)
//   Frequency: completedBookings
//   Monetary: totalSpendInr
// Each scored 1 (worst) - 4 (best) using quartile-ish fixed cutoffs relative
// to the customer population, then combined into a segment label. This is a
// simple, transparent heuristic — not a statistical RFM model.
// ---------------------------------------------------------------------------

export type Segment = "VIP" | "Loyal" | "Regular" | "At Risk" | "New" | "Lapsed";

export interface CustomerSegment extends CustomerLtv {
  recencyDays: number | null;
  segment: Segment;
}

export function segmentCustomers(database: Db | undefined, asOf: string): CustomerSegment[] {
  const rows = getCustomerLtvTable(database);
  const asOfMs = new Date(asOf + "T00:00:00Z").getTime();

  return rows.map((r) => {
    const recencyDays = r.lastBookingDate
      ? Math.round((asOfMs - new Date(r.lastBookingDate + "T00:00:00Z").getTime()) / 86_400_000)
      : null;

    let segment: Segment;
    if (r.completedBookings === 0) {
      segment = "New";
    } else if (recencyDays !== null && recencyDays > 365) {
      segment = "Lapsed";
    } else if (r.completedBookings >= 3 && r.totalSpendInr > 0) {
      segment = "VIP";
    } else if (r.completedBookings === 2) {
      segment = "Loyal";
    } else if (recencyDays !== null && recencyDays > 180) {
      segment = "At Risk";
    } else {
      segment = "Regular";
    }

    return { ...r, recencyDays, segment };
  });
}

/** Top N% of customers by lifetime spend. */
export function detectVips(database: Db | undefined, topPct = 10): CustomerLtv[] {
  const rows = getCustomerLtvTable(database)
    .filter((r) => r.totalSpendInr > 0)
    .sort((a, b) => b.totalSpendInr - a.totalSpendInr);
  const count = Math.max(1, Math.ceil((rows.length * topPct) / 100));
  return rows.slice(0, count);
}

// ---------------------------------------------------------------------------
// Repeat customers
// ---------------------------------------------------------------------------

export function getRepeatCustomerStats(database?: Db): { totalCustomers: number; repeatCustomers: number; repeatRatePct: number | null } {
  const rows = getCustomerLtvTable(database);
  const repeat = rows.filter((r) => r.completedBookings > 1).length;
  return {
    totalCustomers: rows.length,
    repeatCustomers: repeat,
    repeatRatePct: rows.length > 0 ? pct(safeDiv(repeat, rows.length)) : null,
  };
}

// ---------------------------------------------------------------------------
// Referral trees: parent -> children graph from referred_by_customer_id.
// ---------------------------------------------------------------------------

export interface ReferralNode {
  customerId: string;
  fullName: string;
  children: ReferralNode[];
}

export function getReferralTree(database: Db | undefined, rootCustomerId: string): ReferralNode {
  const d = resolveDb(database);
  const all = d.prepare(`SELECT customer_id, full_name, referred_by_customer_id FROM customers`).all() as {
    customer_id: string;
    full_name: string;
    referred_by_customer_id: string | null;
  }[];

  const childrenOf = new Map<string, typeof all>();
  for (const c of all) {
    if (!c.referred_by_customer_id) continue;
    const list = childrenOf.get(c.referred_by_customer_id) ?? [];
    list.push(c);
    childrenOf.set(c.referred_by_customer_id, list);
  }

  function build(customerId: string, seen: Set<string>): ReferralNode {
    const self = all.find((c) => c.customer_id === customerId);
    const children = (childrenOf.get(customerId) ?? [])
      .filter((c) => !seen.has(c.customer_id)) // guard against any accidental cycles
      .map((c) => build(c.customer_id, new Set([...seen, c.customer_id])));
    return { customerId, fullName: self?.full_name ?? customerId, children };
  }

  return build(rootCustomerId, new Set([rootCustomerId]));
}

export interface TopReferrer {
  customerId: string;
  fullName: string;
  directReferrals: number;
}

export function getTopReferrers(database: Db | undefined, limit = 10): TopReferrer[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT c1.referred_by_customer_id AS customerId, c2.full_name AS fullName, COUNT(*) AS directReferrals
       FROM customers c1
       JOIN customers c2 ON c2.customer_id = c1.referred_by_customer_id
       WHERE c1.referred_by_customer_id IS NOT NULL
       GROUP BY c1.referred_by_customer_id ORDER BY directReferrals DESC LIMIT ?`
    )
    .all(limit) as TopReferrer[];
  return rows;
}

// ---------------------------------------------------------------------------
// Cancellation behaviour
// ---------------------------------------------------------------------------

export interface CancellationStats {
  range: DateRange;
  totalBookings: number;
  cancelled: number;
  noShow: number;
  cancellationRatePct: number | null;
  noShowRatePct: number | null;
  byReason: Record<string, number>;
  byDaysBeforeDeparture: Record<string, number>;
  refundAmountsInr: number;
}

export function getCancellationBehavior(database: Db | undefined, range: DateRange): CancellationStats {
  const d = resolveDb(database);
  
  // Basic stats
  const row = d
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS noShow
       FROM bookings WHERE booking_date BETWEEN ? AND ?`
    )
    .get(range.from, range.to) as { total: number; cancelled: number; noShow: number };

  // Refunds
  const refundRow = d.prepare(
    `SELECT COALESCE(SUM(amount_inr), 0) as totalRefunds
     FROM payments WHERE payment_type = 'refund' AND payment_date BETWEEN ? AND ?`
  ).get(range.from, range.to) as { totalRefunds: number };

  // Detailed cancellation metrics
  const cancellations = d.prepare(
    `SELECT b.notes, b.booking_date, t.trip_date
     FROM bookings b
     LEFT JOIN trips t ON t.trip_id = b.trip_id
     WHERE b.status = 'cancelled' AND b.booking_date BETWEEN ? AND ?`
  ).all(range.from, range.to) as { notes: string | null; booking_date: string; trip_date: string | null }[];

  const byReason: Record<string, number> = {};
  const byDaysBeforeDeparture: Record<string, number> = {
    "0-2 days": 0,
    "3-7 days": 0,
    "8-14 days": 0,
    "15+ days": 0,
    "Unknown": 0
  };

  for (const c of cancellations) {
    const reason = c.notes ? "Stated Reason" : "Unspecified";
    byReason[reason] = (byReason[reason] || 0) + 1;

    if (c.booking_date && c.trip_date) {
      const days = daysBetween(c.booking_date, c.trip_date);
      if (days <= 2) byDaysBeforeDeparture["0-2 days"]++;
      else if (days <= 7) byDaysBeforeDeparture["3-7 days"]++;
      else if (days <= 14) byDaysBeforeDeparture["8-14 days"]++;
      else byDaysBeforeDeparture["15+ days"]++;
    } else {
      byDaysBeforeDeparture["Unknown"]++;
    }
  }

  return {
    range,
    totalBookings: row.total,
    cancelled: row.cancelled,
    noShow: row.noShow,
    cancellationRatePct: row.total > 0 ? pct(safeDiv(row.cancelled, row.total)) : null,
    noShowRatePct: row.total > 0 ? pct(safeDiv(row.noShow, row.total)) : null,
    byReason,
    byDaysBeforeDeparture,
    refundAmountsInr: refundRow.totalRefunds,
  };
}

// ---------------------------------------------------------------------------
// Booking Velocity and Lead Time
// ---------------------------------------------------------------------------

export interface BookingVelocityStats {
  range: DateRange;
  avgLeadTimeDays: number | null;
  avgBookingsPerDay: number | null;
  byChannelLeadTime: Record<string, number>;
}

export function getBookingVelocity(database: Db | undefined, range: DateRange): BookingVelocityStats {
  const d = resolveDb(database);
  
  const bookings = d.prepare(
    `SELECT b.booking_date, t.trip_date, c.name as channel_name
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     LEFT JOIN marketing_channels c ON c.channel_id = b.channel_id
     WHERE b.booking_date BETWEEN ? AND ? AND b.status IN ('confirmed', 'completed')`
  ).all(range.from, range.to) as { booking_date: string; trip_date: string; channel_name: string | null }[];

  let totalLeadTime = 0;
  const channelLeadTimes: Record<string, { total: number; count: number }> = {};

  for (const b of bookings) {
    const days = Math.max(0, daysBetween(b.booking_date, b.trip_date));
    totalLeadTime += days;
    
    const channel = b.channel_name || "Direct/Unknown";
    if (!channelLeadTimes[channel]) channelLeadTimes[channel] = { total: 0, count: 0 };
    channelLeadTimes[channel].total += days;
    channelLeadTimes[channel].count++;
  }

  const byChannelLeadTime: Record<string, number> = {};
  for (const [channel, stats] of Object.entries(channelLeadTimes)) {
    byChannelLeadTime[channel] = round2(stats.total / stats.count);
  }

  const totalDays = Math.max(1, daysBetween(range.from, range.to) + 1);

  return {
    range,
    avgLeadTimeDays: bookings.length > 0 ? round2(totalLeadTime / bookings.length) : null,
    avgBookingsPerDay: round2(bookings.length / totalDays),
    byChannelLeadTime,
  };
}

// ---------------------------------------------------------------------------
// Feedback / NPS trends (monthly buckets)
// ---------------------------------------------------------------------------

export interface FeedbackTrendBucket {
  month: string; // "YYYY-MM"
  responses: number;
  avgOverall: number | null;
  avgCaptain: number | null;
  avgHospitality: number | null;
  avgValue: number | null;
  nps: { score: number | null; responses: number };
}

export function getFeedbackTrend(database: Db | undefined, range: DateRange): FeedbackTrendBucket[] {
  const d = resolveDb(database);
  const rows = d
    .prepare(
      `SELECT submitted_date, rating_overall, rating_captain, rating_hospitality, rating_value, nps_score
       FROM feedback WHERE submitted_date BETWEEN ? AND ?`
    )
    .all(range.from, range.to) as {
    submitted_date: string;
    rating_overall: number | null;
    rating_captain: number | null;
    rating_hospitality: number | null;
    rating_value: number | null;
    nps_score: number | null;
  }[];

  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = monthBucket(r.submitted_date);
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }

  const avg = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  };

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, list]) => ({
      month,
      responses: list.length,
      avgOverall: avg(list.map((r) => r.rating_overall)),
      avgCaptain: avg(list.map((r) => r.rating_captain)),
      avgHospitality: avg(list.map((r) => r.rating_hospitality)),
      avgValue: avg(list.map((r) => r.rating_value)),
      nps: (() => {
        const scores = list.map((r) => r.nps_score).filter((v): v is number => v !== null);
        const result = computeNps(scores);
        return { score: result.npsScore, responses: result.responses };
      })(),
    }));
}
