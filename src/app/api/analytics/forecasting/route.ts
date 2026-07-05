import type { NextRequest } from "next/server";
import { forecastRevenue, forecastBookings, forecastOccupancy } from "@/server/domain/analytics/forecasting";
import { jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/forecasting?metric=revenue|bookings|occupancy&periods=3&months=12
export async function GET(request: NextRequest) {
  const metric = request.nextUrl.searchParams.get("metric") ?? "revenue";
  const periods = Number(request.nextUrl.searchParams.get("periods") ?? 3);
  const months = Number(request.nextUrl.searchParams.get("months") ?? 12);

  switch (metric) {
    case "revenue":
      return Response.json(forecastRevenue(undefined, periods, months));
    case "bookings":
      return Response.json(forecastBookings(undefined, periods, months));
    case "occupancy":
      return Response.json(forecastOccupancy(undefined, periods, months));
    default:
      return jsonError(`unknown metric '${metric}'`);
  }
}
