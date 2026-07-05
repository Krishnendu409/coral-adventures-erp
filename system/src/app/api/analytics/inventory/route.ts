import type { NextRequest } from "next/server";
import {
  getAllStockEstimates,
  getCurrentStockEstimate,
  getReorderAlerts,
  getConsumptionRate,
  getShrinkageTotals,
  getVendorCostAnalysis,
} from "@/server/domain/analytics/inventory";
import { parseDateRange, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/inventory?view=...&itemId=&from=&to=
// view: stock | reorder-alerts | consumption | shrinkage | vendor-cost
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "stock";
  const itemId = request.nextUrl.searchParams.get("itemId") ?? undefined;

  switch (view) {
    case "stock":
      return Response.json(itemId ? getCurrentStockEstimate(undefined, itemId) : getAllStockEstimates());
    case "reorder-alerts":
      return Response.json(getReorderAlerts());
    case "consumption": {
      if (!itemId) return jsonError("itemId is required");
      return Response.json(getConsumptionRate(undefined, itemId, parseDateRange(request)));
    }
    case "shrinkage":
      return Response.json(getShrinkageTotals(undefined, parseDateRange(request)));
    case "vendor-cost":
      return Response.json(getVendorCostAnalysis(undefined, parseDateRange(request)));
    default:
      return jsonError(`unknown view '${view}'`);
  }
}
