import { ExecutiveReportData } from "../executiveData";

function csvEscape(value: string | number | null): string {
  const v = String(value ?? "");
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function generateCsv(data: ExecutiveReportData): Buffer {
  const header = "id,vessel_id,status,departure_time,revenue_inr\n";
  const rows = data.trips.map(t => [
    csvEscape(t.id),
    csvEscape(t.vessel_id),
    csvEscape(t.status),
    csvEscape(t.departure_time),
    csvEscape(t.revenue_inr)
  ].join(',')).join('\n');
  
  // Prepend summary
  const summary = `"Timeframe","${data.timeframe}"\n"Total Revenue","${data.totalRevenue}"\n"Total Trips","${data.totalTrips}"\n"Avg NPS","${data.averageNps}"\n\n`;
  
  return Buffer.from(summary + header + rows, "utf-8");
}
