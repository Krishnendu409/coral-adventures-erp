import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
type Database = any;
import { getDb } from "../../db/client";
import { PATHS } from "../../config/paths";
import { ID_PREFIX, nextId } from "../ids";
import type { TemplateType } from "../templates/sheetSpecs";
import { toDateOnlyString, toDateTimeString } from "../shared/excelDate";
import type { ParsedWorkbook } from "./parse";
import { scanIncoming, validateTripFolderRich } from "./validate";
import type { ImportResult, ValidationIssue } from "./types";

export { scanIncoming } from "./validate";

interface CommitTrip {
  trip_id: string;
  trip_date: string;
  vessel_id: string;
}

function computeSha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function insertIssues(db: Database, batchId: string, issues: ValidationIssue[]): void {
  if (issues.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO import_errors (batch_id, file_name, sheet_name, cell_reference, error_type, error_message, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const run = db.transaction((rows: ValidationIssue[]) => {
    for (const issue of rows) {
      stmt.run(batchId, issue.fileName, issue.sheetName ?? null, issue.cellReference ?? null, issue.errorType, issue.errorMessage, issue.severity);
    }
  });
  run(issues);
}

/**
 * Builds every domain row implied by a validated trip folder's workbooks, in
 * a single synchronous unit of work. better-sqlite3 wraps this in
 * db.transaction() at the call site, so any thrown error rolls back
 * everything written so far automatically.
 */
function commitEntities(
  db: Database,
  batchId: string,
  trip: CommitTrip,
  parsed: Partial<Record<TemplateType, ParsedWorkbook>>
): void {
  const year = Number(trip.trip_date.slice(0, 4));

  // ---- Captain: trip outcome + fuel + weather -----------------------
  const captainRow = parsed.captain?.sheets["Trip Log"]?.rows[0];
  if (captainRow) {
    const v = captainRow.values;
    const departure = v.actual_departure as Date;
    const arrival = v.actual_return as Date;

    db.prepare(
      `UPDATE trips SET actual_departure = ?, actual_return = ?, status = ?, cancellation_reason = ?, notes = ?, import_batch_id = ?
       WHERE trip_id = ?`
    ).run(
      toDateTimeString(departure),
      toDateTimeString(arrival),
      v.status as string,
      (v.cancellation_reason as string) || null,
      (v.notes as string) || null,
      batchId,
      trip.trip_id
    );

    db.prepare(
      `INSERT INTO fuel_logs (trip_id, liters_consumed, cost_inr, engine_hours, logged_at) VALUES (?, ?, ?, ?, ?)`
    ).run(trip.trip_id, v.liters_consumed as number, v.fuel_cost_inr as number, v.engine_hours as number, toDateTimeString(arrival));

    db.prepare(
      `INSERT INTO weather_logs (trip_id, log_date, condition, wind_speed_kmh, wave_height_m, temperature_c, visibility, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trip.trip_id,
      trip.trip_date,
      v.weather_condition as string,
      (v.wind_speed_kmh as number) ?? null,
      (v.wave_height_m as number) ?? null,
      (v.temperature_c as number) ?? null,
      (v.visibility as string) || null,
      null
    );
  }

  // ---- Reservations: Bookings -> customers + bookings ---------------------
  const bookingIdByRow = new Map<number, string>();
  const customerIdByBookingRow = new Map<number, string | null>();
  const bookingsSheet = parsed.reservations?.sheets["Bookings"];
  if (bookingsSheet) {
    for (const row of bookingsSheet.rows) {
      const v = row.values;
      const phone = (v.phone as string) || null;

      let customerId: string | null = null;
      if (phone) {
        const existing = db.prepare("SELECT customer_id FROM customers WHERE phone = ?").get(phone) as
          | { customer_id: string }
          | undefined;
        if (existing) customerId = existing.customer_id;
      }
      if (!customerId) {
        customerId = nextId(db, ID_PREFIX.customer);
        db.prepare(
          `INSERT INTO customers (customer_id, full_name, phone, email, city, customer_type, acquisition_channel_id, first_trip_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          customerId,
          v.customer_full_name as string,
          phone,
          (v.email as string) || null,
          (v.city as string) || null,
          (v.customer_type as string) || "individual",
          row.lookupIds.acquisition_channel ?? null,
          trip.trip_date
        );
      }

      const bookingId = nextId(db, ID_PREFIX.booking, { yearly: true, year });
      db.prepare(
        `INSERT INTO bookings (booking_id, trip_id, customer_id, channel_id, booking_date, passenger_count, cruise_type_id, group_discount_applied, status, booking_source, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        bookingId,
        trip.trip_id,
        customerId,
        row.lookupIds.acquisition_channel ?? null,
        toDateOnlyString(v.booking_date as Date),
        v.passenger_count as number,
        row.lookupIds.cruise_type as string,
        v.group_discount_applied === "Yes" ? 1 : 0,
        (v.status as string) || "confirmed",
        (v.booking_source as string) || null,
        batchId
      );

      bookingIdByRow.set(row.rowNumber, bookingId);
      customerIdByBookingRow.set(row.rowNumber, customerId);
    }
  }

  // ---- Reservations: Payments ---------------------------------------------
  const paymentsSheet = parsed.reservations?.sheets["Payments"];
  if (paymentsSheet) {
    for (const row of paymentsSheet.rows) {
      const v = row.values;
      const bookingId = bookingIdByRow.get(v.booking_ref as number);
      if (!bookingId) continue; // validated already; defensive no-op
      const paymentId = nextId(db, ID_PREFIX.payment, { yearly: true, year });
      db.prepare(
        `INSERT INTO payments (payment_id, booking_id, amount_inr, payment_method, payment_date, payment_type, status, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        paymentId,
        bookingId,
        v.amount_inr as number,
        v.payment_method as string,
        toDateOnlyString(v.payment_date as Date),
        v.payment_type as string,
        (v.status as string) || "completed",
        batchId
      );
    }
  }

  // ---- Finance: Expenses ----------------------------------------------
  const expensesSheet = parsed.finance?.sheets["Expenses"];
  if (expensesSheet) {
    for (const row of expensesSheet.rows) {
      const v = row.values;
      const expenseId = nextId(db, ID_PREFIX.expense, { yearly: true, year });
      db.prepare(
        `INSERT INTO expenses (expense_id, trip_id, expense_date, category, amount_inr, vendor_name, description, payment_status, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        expenseId,
        trip.trip_id,
        toDateOnlyString(v.expense_date as Date),
        v.category as string,
        v.amount_inr as number,
        (v.vendor_name as string) || null,
        (v.description as string) || null,
        (v.payment_status as string) || "paid",
        batchId
      );
    }
  }

  // ---- Hospitality: Onboard Sales (payments, payment_type=onboard) ---
  const onboardSheet = parsed.hospitality?.sheets["Onboard Sales"];
  if (onboardSheet) {
    for (const row of onboardSheet.rows) {
      const v = row.values;
      const bookingId = bookingIdByRow.get(v.booking_ref as number);
      if (!bookingId) continue;
      const paymentId = nextId(db, ID_PREFIX.payment, { yearly: true, year });
      db.prepare(
        `INSERT INTO payments (payment_id, booking_id, amount_inr, payment_method, payment_date, payment_type, status, import_batch_id)
         VALUES (?, ?, ?, ?, ?, 'onboard', ?, ?)`
      ).run(
        paymentId,
        bookingId,
        v.amount_inr as number,
        v.payment_method as string,
        toDateOnlyString(v.payment_date as Date),
        (v.status as string) || "completed",
        batchId
      );
    }
  }

  // ---- Hospitality: Inventory Consumption -----------------------------
  const consumptionSheet = parsed.hospitality?.sheets["Inventory Consumption"];
  if (consumptionSheet) {
    for (const row of consumptionSheet.rows) {
      const v = row.values;
      db.prepare(
        `INSERT INTO inventory_stock_movements (item_id, trip_id, movement_type, quantity, movement_date, unit_cost_inr, notes, import_batch_id)
         VALUES (?, ?, 'consumption', ?, ?, ?, ?, ?)`
      ).run(
        row.lookupIds.item,
        trip.trip_id,
        v.quantity as number,
        toDateOnlyString(v.movement_date as Date),
        (v.unit_cost_inr as number) ?? null,
        (v.notes as string) || null,
        batchId
      );
    }
  }

  // ---- Maintenance ------------------------------------------------------
  const maintenanceSheet = parsed.maintenance?.sheets["Maintenance Records"];
  if (maintenanceSheet) {
    for (const row of maintenanceSheet.rows) {
      const v = row.values;
      const maintYear = (v.maintenance_date as Date).getUTCFullYear();
      const maintenanceId = nextId(db, ID_PREFIX.maintenance, { yearly: true, year: maintYear });
      db.prepare(
        `INSERT INTO maintenance_records (maintenance_id, vessel_id, maintenance_date, type, component, description, cost_inr, downtime_hours, next_due_date, performed_by, status, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        maintenanceId,
        trip.vessel_id,
        toDateOnlyString(v.maintenance_date as Date),
        v.type as string,
        v.component as string,
        (v.description as string) || null,
        (v.cost_inr as number) ?? 0,
        (v.downtime_hours as number) ?? 0,
        v.next_due_date ? toDateOnlyString(v.next_due_date as Date) : null,
        (v.performed_by as string) || null,
        (v.status as string) || "completed",
        batchId
      );
    }
  }

  // ---- Inventory: Stock Movements (restock/waste/shrinkage) ------------
  const stockSheet = parsed.inventory?.sheets["Stock Movements"];
  if (stockSheet) {
    for (const row of stockSheet.rows) {
      const v = row.values;
      db.prepare(
        `INSERT INTO inventory_stock_movements (item_id, trip_id, movement_type, quantity, movement_date, unit_cost_inr, notes, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        row.lookupIds.item,
        trip.trip_id,
        v.movement_type as string,
        v.quantity as number,
        toDateOnlyString(v.movement_date as Date),
        (v.unit_cost_inr as number) ?? null,
        (v.notes as string) || null,
        batchId
      );
    }
  }

  // ---- Feedback: Customer Feedback --------------------------------------
  const feedbackSheet = parsed.feedback?.sheets["Customer Feedback"];
  if (feedbackSheet) {
    for (const row of feedbackSheet.rows) {
      const v = row.values;
      const customerId = v.booking_ref != null ? customerIdByBookingRow.get(v.booking_ref as number) ?? null : null;
      const feedbackId = nextId(db, ID_PREFIX.feedback, { yearly: true, year });
      db.prepare(
        `INSERT INTO feedback (feedback_id, trip_id, customer_id, rating_overall, rating_captain, rating_hospitality, rating_value, nps_score, comments, submitted_date, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        feedbackId,
        trip.trip_id,
        customerId,
        v.rating_overall as number,
        (v.rating_captain as number) ?? null,
        (v.rating_hospitality as number) ?? null,
        (v.rating_value as number) ?? null,
        (v.nps_score as number) ?? null,
        (v.comments as string) || null,
        toDateOnlyString(v.submitted_date as Date),
        batchId
      );
    }
  }

  // ---- Feedback: Complaints ----------------------------------------------
  const complaintsSheet = parsed.feedback?.sheets["Complaints"];
  if (complaintsSheet) {
    for (const row of complaintsSheet.rows) {
      const v = row.values;
      const customerId = v.booking_ref != null ? customerIdByBookingRow.get(v.booking_ref as number) ?? null : null;
      const complaintId = nextId(db, ID_PREFIX.complaint, { yearly: true, year });
      db.prepare(
        `INSERT INTO complaints (complaint_id, trip_id, customer_id, category, description, severity, status, filed_date, resolved_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        complaintId,
        trip.trip_id,
        customerId,
        v.category as string,
        v.description as string,
        (v.severity as string) || "medium",
        (v.status as string) || "open",
        toDateOnlyString(v.filed_date as Date),
        v.resolved_date ? toDateOnlyString(v.resolved_date as Date) : null
      );
    }
  }

  // ---- Marketing: Leads ---------------------------------------------------
  const leadsSheet = parsed.marketing?.sheets["Leads"];
  if (leadsSheet) {
    for (const row of leadsSheet.rows) {
      const v = row.values;
      const channelId = row.lookupIds.channel ?? null;

      let campaignId: string | null = null;
      if (typeof v.campaign_name === "string" && v.campaign_name.length > 0 && channelId) {
        const campaign = db
          .prepare("SELECT campaign_id FROM campaigns WHERE lower(name) = lower(?) AND channel_id = ?")
          .get(v.campaign_name, channelId) as { campaign_id: string } | undefined;
        campaignId = campaign?.campaign_id ?? null;
      }

      const convertedBookingId =
        v.converted_booking_ref != null ? bookingIdByRow.get(v.converted_booking_ref as number) ?? null : null;

      const leadId = nextId(db, ID_PREFIX.lead, { yearly: true, year });
      db.prepare(
        `INSERT INTO leads (lead_id, channel_id, campaign_id, customer_id, captured_date, contact_info, status, converted_booking_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        leadId,
        channelId,
        campaignId,
        null,
        toDateOnlyString(v.captured_date as Date),
        (v.contact_info as string) || null,
        convertedBookingId ? "converted" : (v.status as string) || "new",
        convertedBookingId
      );
    }
  }
}

/**
 * Imports one trip folder end to end: creates the import_batches row,
 * validates, and either (a) logs errors + marks the batch failed, touching
 * nothing else, or (b) commits every entity in one transaction, then
 * archives the original files as immutable, checksummed, read-only evidence.
 */
export async function importTripFolder(folderPath: string): Promise<ImportResult> {
  const db = getDb();
  const tripId = path.basename(folderPath);
  const startedAt = new Date().toISOString();
  const fileNames = fs.existsSync(folderPath)
    ? fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".xlsx"))
    : [];

  let batchId = "";
  db.transaction(() => {
    batchId = nextId(db, ID_PREFIX.importBatch);
    db.prepare(
      `INSERT INTO import_batches (batch_id, trip_folder_name, import_started_at, status, total_files) VALUES (?, ?, ?, 'validating', ?)`
    ).run(batchId, tripId, startedAt, fileNames.length);
  })();

  const validation = await validateTripFolderRich(folderPath, db);
  insertIssues(db, batchId, validation.issues);

  if (!validation.ok || !validation.trip) {
    db.prepare("UPDATE import_batches SET status = 'failed', import_completed_at = ? WHERE batch_id = ?").run(
      new Date().toISOString(),
      batchId
    );
    return { tripId, folderPath, batchId, status: "failed", issues: validation.issues };
  }

  const trip = validation.trip;

  try {
    const runCommit = db.transaction(() => commitEntities(db, batchId, trip, validation.parsed));
    runCommit();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failureIssue: ValidationIssue = {
      fileName: tripId,
      errorType: "transaction_exception",
      errorMessage: `Unexpected error while writing to the database — the entire import was rolled back and nothing was saved: ${message}`,
      severity: "error",
    };
    insertIssues(db, batchId, [failureIssue]);
    db.prepare("UPDATE import_batches SET status = 'rolled_back', import_completed_at = ? WHERE batch_id = ?").run(
      new Date().toISOString(),
      batchId
    );
    return { tripId, folderPath, batchId, status: "failed", issues: [...validation.issues, failureIssue] };
  }

  // ---- Post-commit: checksum, archive, and audit ------------------------
  const [y, mo, d] = trip.trip_date.split("-");
  const archiveDir = path.join(PATHS.archive, y, mo, d, tripId);
  const archivedFiles: string[] = [];
  const manifestEntries: Array<{ file: string; checksum: string; archivePath: string }> = [];
  const resultIssues = [...validation.issues];

  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const fileName of fileNames) {
      const src = path.join(folderPath, fileName);
      const checksum = computeSha256(src);
      const dest = path.join(archiveDir, fileName);
      fs.renameSync(src, dest);
      fs.chmodSync(dest, 0o444);
      archivedFiles.push(dest);
      manifestEntries.push({ file: fileName, checksum, archivePath: dest });
    }

    // Every file has been moved out — remove the now-empty trip folder from
    // Incoming so it doesn't linger as a stale, file-less entry that a future
    // scanIncoming()/importAllIncoming() run would otherwise trip over.
    try {
      if (fs.readdirSync(folderPath).length === 0) fs.rmdirSync(folderPath);
    } catch {
      // Best-effort only — leaving an empty folder behind is harmless.
    }

    const completedAt = new Date().toISOString();
    db.transaction(() => {
      const insertManifest = db.prepare(
        `INSERT INTO archive_manifest (batch_id, trip_id, original_file_name, archive_path, checksum_sha256, archived_at, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      );
      for (const entry of manifestEntries) {
        insertManifest.run(batchId, tripId, entry.file, entry.archivePath, entry.checksum, completedAt);
      }
      db.prepare(
        `INSERT INTO audit_log (entity_type, entity_id, action, changed_at, new_value_json) VALUES ('trip', ?, 'import', ?, ?)`
      ).run(tripId, completedAt, JSON.stringify({ batchId, files: manifestEntries.map((e) => e.file) }));
      db.prepare(
        "UPDATE import_batches SET status = 'committed', import_completed_at = ?, checksum_manifest_json = ? WHERE batch_id = ?"
      ).run(completedAt, JSON.stringify(manifestEntries), batchId);
    })();
  } catch (err) {
    // The entity data is already durably committed at this point — archiving
    // is a best-effort follow-up step. Surface the problem instead of hiding it.
    const message = err instanceof Error ? err.message : String(err);
    const archiveIssue: ValidationIssue = {
      fileName: tripId,
      errorType: "archive_failed",
      errorMessage: `Data was imported successfully, but archiving the original files failed: ${message}. The files may be left in an inconsistent state between Incoming and Archive — check manually.`,
      severity: "warning",
    };
    insertIssues(db, batchId, [archiveIssue]);
    resultIssues.push(archiveIssue);
  }

  return { tripId, folderPath, batchId, status: "committed", issues: resultIssues, archivedFiles };
}

/** Imports every trip folder currently waiting in data/incoming/, one at a time — a failure in one never affects another. */
export async function importAllIncoming(): Promise<ImportResult[]> {
  const candidates = scanIncoming();
  const results: ImportResult[] = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return await importTripFolder(candidate.folderPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          tripId: candidate.tripId,
          folderPath: candidate.folderPath,
          batchId: "",
          status: "failed",
          issues: [{ fileName: candidate.tripId, errorType: "unexpected_error", errorMessage: message, severity: "error" }],
        };
      }
    })
  );
  return results;
}
