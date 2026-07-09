import type { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import {
  getActiveChannels,
  getChannel,
  computeCac,
  computeLtv,
  computeRoi,
  computeReferralRate,
  computeRepeatCustomerRate,
  getBookingFunnel,
  getChannelAttribution,
  getBreakEvenAnalysis,
  getCampaignComparison,
  projectChannelFunnel,
  scenarioAnalysis,
  recommendBudgetAllocation,
} from "@/server/domain/analytics/marketing";
import { parseDateRange, parseDate, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/marketing?view=...
// view: channels | cac | ltv | roi | referral-rate | repeat-rate | funnel
//       | attribution | break-even | campaigns | project | scenario | allocate-budget
// Params vary by view: channelId, from, to, footfall, cruiseTypeId, spendInr, totalBudgetInr
export async function GET(request: NextRequest) {
  const db = getDb();
  const view = request.nextUrl.searchParams.get("view") ?? "channels";
  const channelId = request.nextUrl.searchParams.get("channelId") ?? undefined;

  switch (view) {
    case "channels":
      return Response.json(channelId ? getChannel(db, channelId) : getActiveChannels(db));

    case "cac": {
      if (!channelId) return jsonError("channelId is required");
      return Response.json(computeCac(db, channelId, parseDateRange(request)));
    }

    case "ltv": {
      if (!channelId) return jsonError("channelId is required");
      return Response.json(computeLtv(db, channelId));
    }

    case "roi": {
      if (!channelId) return jsonError("channelId is required");
      return Response.json(computeRoi(db, channelId, parseDateRange(request)));
    }

    case "referral-rate": {
      if (!channelId) return jsonError("channelId is required");
      return Response.json(computeReferralRate(db, channelId));
    }

    case "repeat-rate":
      return Response.json(computeRepeatCustomerRate(db, channelId));

    case "funnel":
      return Response.json(getBookingFunnel(db, parseDateRange(request), channelId));

    case "attribution":
      return Response.json(getChannelAttribution(db, parseDateRange(request)));

    case "break-even":
      return Response.json(getBreakEvenAnalysis(db, parseDate(request)));

    case "campaigns":
      return Response.json(getCampaignComparison(db, parseDateRange(request)));

    case "project": {
      if (!channelId) return jsonError("channelId is required");
      const footfall = Number(request.nextUrl.searchParams.get("footfall") ?? NaN);
      if (Number.isNaN(footfall)) return jsonError("footfall (number) is required");
      const cruiseTypeId = request.nextUrl.searchParams.get("cruiseTypeId") ?? undefined;
      const spendParam = request.nextUrl.searchParams.get("spendInr");
      return Response.json(
        projectChannelFunnel(db, channelId, footfall, {
          cruiseTypeId,
          spendInr: spendParam ? Number(spendParam) : undefined,
        })
      );
    }

    case "scenario": {
      if (!channelId) return jsonError("channelId is required");
      const footfall = Number(request.nextUrl.searchParams.get("footfall") ?? NaN);
      if (Number.isNaN(footfall)) return jsonError("footfall (number) is required");
      const cruiseTypeId = request.nextUrl.searchParams.get("cruiseTypeId") ?? undefined;
      return Response.json(scenarioAnalysis(db, channelId, footfall, { cruiseTypeId }));
    }

    case "allocate-budget": {
      const totalBudgetInr = Number(request.nextUrl.searchParams.get("totalBudgetInr") ?? NaN);
      if (Number.isNaN(totalBudgetInr)) return jsonError("totalBudgetInr (number) is required");
      return Response.json(recommendBudgetAllocation(db, totalBudgetInr));
    }

    default:
      return jsonError(`unknown view '${view}'`);
  }
}
