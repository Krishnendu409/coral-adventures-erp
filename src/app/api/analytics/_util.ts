import type { NextRequest } from "next/server";
import type { DateRange } from "@/server/domain/analytics/shared";
import { todayStr, trailingRange } from "@/server/domain/analytics/shared";

/** Reads ?from=&to= from the query string, defaulting to a trailing window
 * ending today (30 days unless overridden). */
export function parseDateRange(request: NextRequest, defaultDays = 30): DateRange {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (from && to) return { from, to };
  return trailingRange(defaultDays, to ?? todayStr());
}

export function parseDate(request: NextRequest, param = "date"): string {
  return request.nextUrl.searchParams.get(param) ?? todayStr();
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
