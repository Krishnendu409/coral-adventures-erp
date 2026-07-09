import { getDb } from "@/server/db/client";

export interface ExecutiveReportData {
  timeframe: string;
  totalRevenue: number;
  totalTrips: number;
  averageNps: number;
  maintenanceAlerts: number;
  trips: Array<{
    id: string;
    vessel_id: string;
    status: string;
    departure_time: string;
    revenue_inr: number;
  }>;
  revenueByDate: Array<{
    date: string;
    revenue: number;
  }>;
}

export function getExecutiveData(startDate: string, endDate: string, label: string): ExecutiveReportData {
  const db = getDb();
  
  const trips = db.prepare(`
    SELECT 
      t.trip_id as id, 
      t.vessel_id, 
      t.status, 
      t.trip_date as departure_time, 
      COALESCE((SELECT SUM(p.amount_inr) FROM payments p JOIN bookings b ON p.booking_id = b.booking_id WHERE b.trip_id = t.trip_id), 0) as revenue_inr
    FROM trips t
    WHERE t.trip_date >= ? AND t.trip_date <= ?
    ORDER BY t.trip_date DESC
  `).all(startDate, endDate) as any[];

  const revenue = trips.reduce((sum, t) => sum + (t.revenue_inr || 0), 0);
  
  // Aggregate revenue by date for charts
  const revenueMap = new Map<string, number>();
  for (const t of trips) {
    const dateStr = t.departure_time.slice(0, 10);
    revenueMap.set(dateStr, (revenueMap.get(dateStr) || 0) + (t.revenue_inr || 0));
  }
  const revenueByDate = Array.from(revenueMap.entries())
    .map(([date, rev]) => ({ date, revenue: rev }))
    .sort((a, b) => a.date.localeCompare(b.date)); // chronological order

  // Example dummy aggregation for demonstration:
  // In a real app we'd query feedback & maintenance tables
  const avgNps = 8.5; 
  const maintenanceAlerts = 2;

  return {
    timeframe: label,
    totalRevenue: revenue,
    totalTrips: trips.length,
    averageNps: avgNps,
    maintenanceAlerts: maintenanceAlerts,
    trips,
    revenueByDate
  };
}
