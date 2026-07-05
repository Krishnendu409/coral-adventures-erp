import type { NextRequest } from "next/server";
import {
  getCustomerLtvTable,
  getAverageLtv,
  segmentCustomers,
  detectVips,
  getRepeatCustomerStats,
  getReferralTree,
  getTopReferrers,
  getCancellationBehavior,
  getFeedbackTrend,
} from "@/server/domain/analytics/customer";
import { parseDateRange, parseDate, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/customer?view=...
// view: ltv-table | ltv-average | segments | vip | repeat | referral-tree
//       | top-referrers | cancellation | feedback-trend
// Params: customerId (referral-tree), topPct (vip), from/to (cancellation, feedback-trend), date (segments)
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "ltv-average";

  switch (view) {
    case "ltv-table":
      return Response.json(getCustomerLtvTable());
    case "ltv-average":
      return Response.json(getAverageLtv());
    case "segments":
      return Response.json(segmentCustomers(undefined, parseDate(request)));
    case "vip": {
      const topPct = Number(request.nextUrl.searchParams.get("topPct") ?? 10);
      return Response.json(detectVips(undefined, topPct));
    }
    case "repeat":
      return Response.json(getRepeatCustomerStats());
    case "referral-tree": {
      const customerId = request.nextUrl.searchParams.get("customerId");
      if (!customerId) return jsonError("customerId is required");
      return Response.json(getReferralTree(undefined, customerId));
    }
    case "top-referrers": {
      const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10);
      return Response.json(getTopReferrers(undefined, limit));
    }
    case "cancellation":
      return Response.json(getCancellationBehavior(undefined, parseDateRange(request)));
    case "feedback-trend":
      return Response.json(getFeedbackTrend(undefined, parseDateRange(request, 180)));
    default:
      return jsonError(`unknown view '${view}'`);
  }
}
