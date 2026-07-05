import type { NextRequest } from "next/server";
import {
  getTurnaroundTimes,
  getAvgTurnaroundMinutes,
  getDelayAnalysis,
  getDelaySummary,
  getTripUtilizationTrend,
  getBoatUtilization,
  getCrewEfficiency,
  getFuelBurnTrend,
  getEngineHoursAccumulation,
  getDowntimeByVessel,
} from "@/server/domain/analytics/operations";
import { parseDateRange, jsonError } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/operations?view=...&from=&to=&vesselId=
// view: turnaround | turnaround-avg | delay | delay-summary | utilization
//       | boat-utilization | crew-efficiency | fuel-burn | engine-hours | downtime
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "delay-summary";
  const range = parseDateRange(request);
  const vesselId = request.nextUrl.searchParams.get("vesselId") ?? undefined;

  switch (view) {
    case "turnaround":
      return Response.json(getTurnaroundTimes(undefined, range, vesselId));
    case "turnaround-avg":
      return Response.json({ avgTurnaroundMinutes: getAvgTurnaroundMinutes(undefined, range, vesselId) });
    case "delay":
      return Response.json(getDelayAnalysis(undefined, range));
    case "delay-summary":
      return Response.json(getDelaySummary(undefined, range));
    case "utilization":
      return Response.json(getTripUtilizationTrend(undefined, range));
    case "boat-utilization":
      return Response.json(getBoatUtilization(undefined, range));
    case "crew-efficiency":
      return Response.json(getCrewEfficiency(undefined, range));
    case "fuel-burn":
      return Response.json(getFuelBurnTrend(undefined, range));
    case "engine-hours":
      return Response.json(getEngineHoursAccumulation(undefined, range));
    case "downtime":
      return Response.json(getDowntimeByVessel(undefined, range));
    default:
      return jsonError(`unknown view '${view}'`);
  }
}
