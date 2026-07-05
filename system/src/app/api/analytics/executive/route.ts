import type { NextRequest } from "next/server";
import { getExecutiveSummary } from "@/server/domain/analytics/executive";
import { parseDate } from "../_util";

export const dynamic = "force-dynamic";

// GET /api/analytics/executive?date=YYYY-MM-DD&npsWindowDays=30&cashFlowWindowDays=30
export async function GET(request: NextRequest) {
  const date = parseDate(request);
  const npsWindowDays = Number(request.nextUrl.searchParams.get("npsWindowDays") ?? 30);
  const cashFlowWindowDays = Number(request.nextUrl.searchParams.get("cashFlowWindowDays") ?? 30);

  const summary = getExecutiveSummary(undefined, date, { npsWindowDays, cashFlowWindowDays });
  return Response.json(summary);
}
