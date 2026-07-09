import fs from "node:fs";
import path from "node:path";
type Database = any;
import { PATHS } from "../../config/paths";
import { MANDATORY_WORKBOOKS, WORKBOOK_SPECS, type TemplateType } from "../templates/sheetSpecs";
import { toDateOnlyString, todayDateOnlyString } from "../shared/excelDate";
import { parseWorkbookFile, type ParsedSheet, type ParsedWorkbook } from "./parse";
import type { TripFolderCandidate, ValidationIssue, ValidationResult } from "./types";

const TRIP_ID_PATTERN = /^CA-TRP-\d{4}-\d{6}$/;

const FILE_NAME_TO_TYPE = new Map<string, TemplateType>(
  Object.values(WORKBOOK_SPECS).map((spec) => [spec.fileName.toLowerCase(), spec.type])
);

interface TripRow {
  trip_id: string;
  trip_date: string;
  vessel_id: string;
  status: string;
}

/** Lists trip folders waiting under data/incoming/ — read-only, no side effects. */
export function scanIncoming(): TripFolderCandidate[] {
  fs.mkdirSync(PATHS.incoming, { recursive: true });

  return fs
    .readdirSync(PATHS.incoming, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderPath = path.join(PATHS.incoming, entry.name);
      const files = fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".xlsx"));
      return { tripId: entry.name, folderPath, files };
    });
}

/** Rich result used internally by the import engine — includes the parsed workbook data so it isn't re-read from disk. */
export interface RichValidationResult extends ValidationResult {
  trip: TripRow | null;
  parsed: Partial<Record<TemplateType, ParsedWorkbook>>;
}

function isFutureDate(value: unknown, referenceDateIso: string): boolean {
  if (!(value instanceof Date)) return false;
  return toDateOnlyString(value) > referenceDateIso;
}

function isBeforeDate(value: unknown, referenceDateIso: string): boolean {
  if (!(value instanceof Date)) return false;
  return toDateOnlyString(value) < referenceDateIso;
}

function flagFutureDates(
  sheet: ParsedSheet | undefined,
  fileName: string,
  keys: string[],
  todayIso: string,
  issues: ValidationIssue[]
): void {
  if (!sheet) return;
  for (const row of sheet.rows) {
    for (const key of keys) {
      if (isFutureDate(row.values[key], todayIso)) {
        issues.push({
          fileName,
          sheetName: sheet.spec.name,
          errorType: "future_date",
          errorMessage: `Row ${row.rowNumber}: '${key}' cannot be later than today (${todayIso})`,
          severity: "error",
        });
      }
    }
  }
}

function flagDatesBefore(
  sheet: ParsedSheet | undefined,
  fileName: string,
  key: string,
  minDateIso: string,
  minLabel: string,
  issues: ValidationIssue[]
): void {
  if (!sheet) return;
  for (const row of sheet.rows) {
    if (isBeforeDate(row.values[key], minDateIso)) {
      issues.push({
        fileName,
        sheetName: sheet.spec.name,
        errorType: "chronology",
        errorMessage: `Row ${row.rowNumber}: '${key}' cannot be before ${minLabel} (${minDateIso})`,
        severity: "error",
      });
    }
  }
}

/** Validates that every non-blank booking_ref/booking_ref-like column value points at a real row on the Finance > Bookings sheet. */
function flagBookingRefs(
  sheet: ParsedSheet | undefined,
  fileName: string,
  key: string,
  maxBookingRow: number,
  issues: ValidationIssue[]
): void {
  if (!sheet) return;
  for (const row of sheet.rows) {
    const value = row.values[key];
    if (value === null || value === undefined) continue;
    const ref = Number(value);
    if (!Number.isInteger(ref) || ref < 1 || ref > maxBookingRow) {
      issues.push({
        fileName,
        sheetName: sheet.spec.name,
        errorType: "invalid_booking_ref",
        errorMessage: `Row ${row.rowNumber}: booking reference #${String(value)} does not match any row on Finance.xlsx > Bookings (which has ${maxBookingRow} row(s))`,
        severity: "error",
      });
    }
  }
}

/** Full validation of one trip folder: file presence, per-cell type/enum/lookup checks, chronology, and cross-sheet references. */
export async function validateTripFolderRich(folderPath: string, db: Database): Promise<RichValidationResult> {
  const tripId = path.basename(folderPath);
  const issues: ValidationIssue[] = [];
  const todayIso = todayDateOnlyString();

  let trip: TripRow | null = null;
  if (TRIP_ID_PATTERN.test(tripId)) {
    trip =
      (db.prepare("SELECT trip_id, trip_date, vessel_id, status FROM trips WHERE trip_id = ?").get(tripId) as
        | TripRow
        | undefined) ?? null;
  } else {
    issues.push({
      fileName: tripId,
      errorType: "invalid_trip_id",
      errorMessage: `Folder name '${tripId}' does not look like a generated trip id (expected CA-TRP-YYYY-NNNNNN)`,
      severity: "error",
    });
  }

  if (TRIP_ID_PATTERN.test(tripId) && !trip) {
    issues.push({
      fileName: tripId,
      errorType: "unknown_trip",
      errorMessage: `No trip '${tripId}' exists in the database. Trips must be created via "Generate Today's Trip Package" before they can be imported.`,
      severity: "error",
    });
  } else if (trip && trip.status !== "scheduled") {
    issues.push({
      fileName: tripId,
      errorType: "duplicate_import",
      errorMessage: `Trip '${tripId}' has already been imported (status = '${trip.status}'). It cannot be imported again.`,
      severity: "error",
    });
  }

  const entries = fs.existsSync(folderPath)
    ? fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".xlsx"))
    : [];
  if (entries.length === 0) {
    issues.push({
      fileName: tripId,
      errorType: "empty_folder",
      errorMessage: `Folder '${tripId}' contains no .xlsx workbooks`,
      severity: "error",
    });
  }

  const presentByType = new Map<TemplateType, string>();
  for (const fileName of entries) {
    const type = FILE_NAME_TO_TYPE.get(fileName.toLowerCase());
    if (!type) {
      issues.push({
        fileName,
        errorType: "unrecognized_file",
        errorMessage: `File '${fileName}' does not match any expected workbook name and was ignored`,
        severity: "warning",
      });
      continue;
    }
    presentByType.set(type, fileName);
  }

  for (const mandatory of MANDATORY_WORKBOOKS) {
    if (!presentByType.has(mandatory)) {
      issues.push({
        fileName: WORKBOOK_SPECS[mandatory].fileName,
        errorType: "missing_mandatory_file",
        errorMessage: `Required workbook '${WORKBOOK_SPECS[mandatory].fileName}' is missing from this trip folder`,
        severity: "error",
      });
    }
  }

  const parsed: Partial<Record<TemplateType, ParsedWorkbook>> = {};
  for (const [type, fileName] of presentByType) {
    const filePath = path.join(folderPath, fileName);
     
    const result = await parseWorkbookFile(filePath, fileName, WORKBOOK_SPECS[type], db, issues);
    if (result) parsed[type] = result;
  }

  // ---- Cross-sheet / business-rule checks -----------------------------

  const reservationsBookings = parsed.reservations?.sheets["Bookings"];
  const maxBookingRow = reservationsBookings?.rows.length ?? 0;

  // Captain: single-row chronology + not-future.
  const tripLog = parsed.captain?.sheets["Trip Log"];
  if (tripLog && tripLog.rows.length === 1) {
    const row = tripLog.rows[0];
    const departure = row.values.actual_departure;
    const arrival = row.values.actual_return;
    if (departure instanceof Date && arrival instanceof Date && departure.getTime() >= arrival.getTime()) {
      issues.push({
        fileName: "Captain.xlsx",
        sheetName: "Trip Log",
        errorType: "chronology",
        errorMessage: "Actual Departure must be before Actual Return",
        severity: "error",
      });
    }
    if (row.values.status === "cancelled" && !row.values.cancellation_reason) {
      issues.push({
        fileName: "Captain.xlsx",
        sheetName: "Trip Log",
        errorType: "missing_cancellation_reason",
        errorMessage: "Cancellation Reason should be filled when Trip Status is 'cancelled'",
        severity: "warning",
      });
    }
  }
  flagFutureDates(tripLog, "Captain.xlsx", ["actual_departure", "actual_return"], todayIso, issues);

  // Reservations
  flagFutureDates(reservationsBookings, "Reservations.xlsx", ["booking_date"], todayIso, issues);
  flagFutureDates(parsed.reservations?.sheets["Payments"], "Reservations.xlsx", ["payment_date"], todayIso, issues);
  flagBookingRefs(parsed.reservations?.sheets["Payments"], "Reservations.xlsx", "booking_ref", maxBookingRow, issues);

  // Finance
  flagFutureDates(parsed.finance?.sheets["Expenses"], "Finance.xlsx", ["expense_date"], todayIso, issues);

  // Hospitality
  flagFutureDates(parsed.hospitality?.sheets["Onboard Sales"], "Hospitality.xlsx", ["payment_date"], todayIso, issues);
  flagBookingRefs(parsed.hospitality?.sheets["Onboard Sales"], "Hospitality.xlsx", "booking_ref", maxBookingRow, issues);
  flagFutureDates(
    parsed.hospitality?.sheets["Inventory Consumption"],
    "Hospitality.xlsx",
    ["movement_date"],
    todayIso,
    issues
  );

  // Maintenance (next_due_date is expected to be in the future — not checked)
  flagFutureDates(parsed.maintenance?.sheets["Maintenance Records"], "Maintenance.xlsx", ["maintenance_date"], todayIso, issues);

  // Inventory
  flagFutureDates(parsed.inventory?.sheets["Stock Movements"], "Inventory.xlsx", ["movement_date"], todayIso, issues);

  // Feedback
  const customerFeedback = parsed.feedback?.sheets["Customer Feedback"];
  const complaints = parsed.feedback?.sheets["Complaints"];
  flagFutureDates(customerFeedback, "Feedback.xlsx", ["submitted_date"], todayIso, issues);
  flagFutureDates(complaints, "Feedback.xlsx", ["filed_date", "resolved_date"], todayIso, issues);
  flagBookingRefs(customerFeedback, "Feedback.xlsx", "booking_ref", maxBookingRow, issues);
  flagBookingRefs(complaints, "Feedback.xlsx", "booking_ref", maxBookingRow, issues);
  if (trip) {
    flagDatesBefore(customerFeedback, "Feedback.xlsx", "submitted_date", trip.trip_date, "the trip date", issues);
    flagDatesBefore(complaints, "Feedback.xlsx", "filed_date", trip.trip_date, "the trip date", issues);
  }

  // Marketing
  const leads = parsed.marketing?.sheets["Leads"];
  flagFutureDates(leads, "Marketing.xlsx", ["captured_date"], todayIso, issues);
  flagBookingRefs(leads, "Marketing.xlsx", "converted_booking_ref", maxBookingRow, issues);
  if (leads) {
    for (const row of leads.rows) {
      const campaignName = row.values.campaign_name;
      const channelId = row.lookupIds.channel;
      if (typeof campaignName === "string" && campaignName.length > 0 && channelId) {
        const campaign = db
          .prepare("SELECT campaign_id FROM campaigns WHERE lower(name) = lower(?) AND channel_id = ?")
          .get(campaignName, channelId);
        if (!campaign) {
          issues.push({
            fileName: "Marketing.xlsx",
            sheetName: "Leads",
            errorType: "campaign_not_found",
            errorMessage: `Row ${row.rowNumber}: campaign '${campaignName}' was not found for this channel — lead will be imported without a campaign attribution`,
            severity: "warning",
          });
        }
      }
    }
  }

  const ok = issues.every((issue) => issue.severity !== "error");
  return { tripId, folderPath, ok, issues, trip, parsed };
}

/** Public, thinner validation entry point (per spec signature) — discards the parsed payload, keeping only the pass/fail report. */
export async function validateTripFolder(folderPath: string, db: Database): Promise<ValidationResult> {
  const rich = await validateTripFolderRich(folderPath, db);
  return { tripId: rich.tripId, folderPath: rich.folderPath, ok: rich.ok, issues: rich.issues };
}
