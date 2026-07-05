// Coral Adventures operates in a single timezone (IST, Malpe/Udupi). To avoid
// host-machine-timezone drift, every date/datetime that flows through Excel
// is treated as a "wall clock" value stored using JS Date's UTC getters/
// setters — i.e. a cell showing "2026-07-04 09:00" is represented internally
// as `new Date(Date.UTC(2026, 6, 4, 9, 0, 0))`, regardless of what timezone
// the machine running the app happens to be set to. ExcelJS does the same
// thing when it parses a date-formatted cell, so this convention is what
// makes round-tripping a date through Excel safe.

/** Builds a "wall clock" Date for writing into an Excel cell (see file header). */
export function wallClockDate(year: number, monthIndex0: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, monthIndex0, day, hour, minute, second));
}

/** Parses a "YYYY-MM-DD" string (as stored in trips.trip_date etc.) into a wall-clock Date at midnight. */
export function wallClockDateFromIso(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return wallClockDate(y, m - 1, d);
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Formats a wall-clock Date back to "YYYY-MM-DD" using UTC getters. */
export function toDateOnlyString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Formats a wall-clock Date to "YYYY-MM-DDTHH:mm:ss" using UTC getters. */
export function toDateTimeString(d: Date): string {
  return `${toDateOnlyString(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Today's calendar date (host machine's local date, assumed to be running in the business's own timezone) as "YYYY-MM-DD". */
export function todayDateOnlyString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
