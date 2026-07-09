import type { NextRequest } from "next/server";
import {
  getUpcomingAndOverdueMaintenance,
  getFailureFrequencyByComponent,
  getDowntimeCost,
  getBoatHealthScore,
} from "@/server/domain/analytics/maintenance";
import { parseDateRange, parseDate, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/maintenance?view=...&vesselId=&date=&from=&to=
// view: alerts | failure-frequency | downtime-cost | health-score
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "alerts";
  const date = parseDate(request);

  switch (view) {
    case "alerts":
      return Response.json(getUpcomingAndOverdueMaintenance(undefined, date));
    case "failure-frequency":
      return Response.json(getFailureFrequencyByComponent(undefined, parseDateRange(request)));
    case "downtime-cost":
      return Response.json(getDowntimeCost(undefined, date, parseDateRange(request)));
    case "health-score": {
      const vesselId = request.nextUrl.searchParams.get("vesselId");
      if (!vesselId) return jsonError("vesselId is required");
      return Response.json(getBoatHealthScore(undefined, vesselId, date));
    }
    default:
      return jsonError(`unknown view '${view}'`);
  }
}
