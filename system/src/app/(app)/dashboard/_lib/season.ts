import type { DateRange } from "@/server/domain/analytics/shared";

/**
 * Jun-Sep monsoon low season per CLAUDE.md / the seeded seasonality
 * assumptions (e.g. June seasonality index ~= 0.15). This is presentation-
 * layer calendar classification for an explanatory Callout only — it is
 * NEVER used as an input to any KPI calculation (those all live in
 * src/server/domain/analytics and read business_parameters/facts directly).
 */
const MONSOON_MONTHS = new Set([6, 7, 8, 9]);

/** Fraction (0..1) of the calendar months touched by `range` that fall in
 * the monsoon window. */
export function monsoonMonthFraction(range: DateRange): number {
  const months = new Set<string>();
  let cursor = new Date(`${range.from.slice(0, 7)}-01T00:00:00Z`);
  const stop = new Date(`${range.to.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= stop) {
    months.add(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  if (months.size === 0) return 0;
  let monsoonCount = 0;
  for (const m of months) {
    if (MONSOON_MONTHS.has(Number(m.slice(5, 7)))) monsoonCount += 1;
  }
  return monsoonCount / months.size;
}

export function formatRangeLabel(range: DateRange): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}
