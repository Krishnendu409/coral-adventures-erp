import type { NextRequest } from "next/server";
import {
  getFinancialSummary,
  getPerTripProfit,
  getPerRouteProfit,
  getPerCruiseTypeProfit,
  getRevenueByBookingCruiseType,
  getCashFlowTrend,
  getPayrollTotal,
  getVendorPaymentTotals,
} from "@/server/domain/analytics/financial";
import { parseDateRange, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/financial?view=summary&from=&to=
// view: summary | per-trip | per-route | per-cruise-type | revenue-by-booking-cruise-type
//       | cash-flow-trend (&granularity=day|week) | payroll | vendor-payments
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "summary";
  const range = parseDateRange(request);

  switch (view) {
    case "summary":
      return Response.json(getFinancialSummary(undefined, range));
    case "per-trip":
      return Response.json(getPerTripProfit(undefined, range));
    case "per-route":
      return Response.json(getPerRouteProfit(undefined, range));
    case "per-cruise-type":
      return Response.json(getPerCruiseTypeProfit(undefined, range));
    case "revenue-by-booking-cruise-type":
      return Response.json(getRevenueByBookingCruiseType(undefined, range));
    case "cash-flow-trend": {
      const granularity = (request.nextUrl.searchParams.get("granularity") as "day" | "week") ?? "day";
      return Response.json(getCashFlowTrend(undefined, range, granularity));
    }
    case "payroll":
      return Response.json(getPayrollTotal(undefined, range));
    case "vendor-payments":
      return Response.json(getVendorPaymentTotals(undefined, range));
    default:
      return jsonError(`unknown view '${view}'`);
  }
}
