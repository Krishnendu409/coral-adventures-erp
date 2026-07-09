import fs from "node:fs";
import path from "node:path";
type Database = any;
import { getDb } from "../../db/client";
import { PATHS } from "../../config/paths";
import { ID_PREFIX, nextId } from "../ids";
import { WORKBOOK_ORDER, WORKBOOK_SPECS, type TemplateType } from "./sheetSpecs";
import { loadTripContext, type TripContext } from "./tripContext";
import { buildWorkbook } from "./templateBuilder";
import { wallClockDate, toDateTimeString, todayDateOnlyString } from "../shared/excelDate";

export type { TemplateType } from "./sheetSpecs";

export interface GeneratedTripPackage {
  tripId: string;
  folderPath: string;
  files: string[];
}

export interface TodaysPackageResult {
  tripDate: string;
  trips: GeneratedTripPackage[];
}

function tripFolderPath(tripDateIso: string, tripId: string): string {
  const [y, m, d] = tripDateIso.split("-");
  return path.join(PATHS.generated, y, m, d, tripId);
}

/** Generates the full 7-workbook set for one already-existing trip. */
export async function generateTripPackage(tripId: string): Promise<GeneratedTripPackage> {
  const db = getDb();
  const context = loadTripContext(db, tripId);

  const folderPath = tripFolderPath(context.tripDate, tripId);
  fs.mkdirSync(folderPath, { recursive: true });

  const files: string[] = [];
  
  // Check if all files already exist and have content. If so, skip generation.
  const allExist = WORKBOOK_ORDER.every(type => {
    const spec = WORKBOOK_SPECS[type];
    const fp = path.join(folderPath, spec.fileName);
    return fs.existsSync(fp) && fs.statSync(fp).size > 0;
  });

  if (allExist) {
    WORKBOOK_ORDER.forEach(type => {
      files.push(path.join(folderPath, WORKBOOK_SPECS[type].fileName));
    });
    return { tripId, folderPath, files };
  }

  for (const type of WORKBOOK_ORDER) {
    const spec = WORKBOOK_SPECS[type];
    const workbook = await buildWorkbook(db, spec, context);
    const filePath = path.join(folderPath, spec.fileName);
    await workbook.xlsx.writeFile(filePath);
    files.push(filePath);
    // Yield to the event loop so the server remains responsive during heavy generation
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { tripId, folderPath, files };
}

/**
 * Fixed daily slot start times. There is no business_parameters entry for
 * this (it's an operational schedule decision, not a financial assumption),
 * so it's a documented constant here: morning 09:00, afternoon 13:00,
 * evening 17:00 (sunset slot), each running for `trip_duration_hrs`.
 */
const SLOT_START_HOURS: Record<"morning" | "afternoon" | "evening", number> = {
  morning: 9,
  afternoon: 13,
  evening: 17,
};

/**
 * Design decision: with 3 cruise_types seeded (Standard, Premium / Sunset,
 * Charter) and 3 daily slots, the morning and afternoon slots default to the
 * "Standard" cruise type and the evening slot to "Premium / Sunset" (it's the
 * golden-hour/sunset slot). If those names aren't found (e.g. re-seeded with
 * different cruise type names) we fall back to cycling through whatever
 * cruise_types rows exist so generation never hard-fails on naming.
 */
function pickCruiseTypeId(
  cruiseTypes: Array<{ cruise_type_id: string; name: string }>,
  slot: "morning" | "afternoon" | "evening",
  slotIndex: number
): string {
  const wantName = slot === "evening" ? "Premium / Sunset" : "Standard";
  const match = cruiseTypes.find((c) => c.name.toLowerCase() === wantName.toLowerCase());
  if (match) return match.cruise_type_id;
  return cruiseTypes[slotIndex % cruiseTypes.length].cruise_type_id;
}

function getBusinessParameter(db: Database, erpField: string, fallback: number): number {
  const row = db.prepare("SELECT value FROM business_parameters WHERE erp_field = ?").get(erpField) as
    | { value: number | null }
    | undefined;
  return row?.value ?? fallback;
}

/**
 * Ensures today's 3 trip-slot rows exist (creating any missing ones, never
 * duplicating existing ones — safe to call multiple times in the same day),
 * then generates the 7-workbook package for each.
 */
export async function generateTodaysTripPackage(): Promise<TodaysPackageResult> {
  const db = getDb();
  const tripDate = todayDateOnlyString();
  const year = new Date().getFullYear();

  const vessel = db.prepare("SELECT vessel_id, capacity FROM vessels WHERE status = 'active' ORDER BY vessel_id LIMIT 1").get() as
    | { vessel_id: string; capacity: number }
    | undefined;
  if (!vessel) throw new Error("generateTodaysTripPackage: no active vessel found — has seed() been run?");

  const route = db.prepare("SELECT route_id FROM routes ORDER BY route_id LIMIT 1").get() as { route_id: string } | undefined;
  if (!route) throw new Error("generateTodaysTripPackage: no route found — has seed() been run?");

  const cruiseTypes = db.prepare("SELECT cruise_type_id, name FROM cruise_types ORDER BY cruise_type_id").all() as Array<{
    cruise_type_id: string;
    name: string;
  }>;
  if (cruiseTypes.length === 0) throw new Error("generateTodaysTripPackage: no cruise_types found — has seed() been run?");

  const captain = db
    .prepare("SELECT crew_id FROM crew WHERE role = 'captain' AND status = 'active' ORDER BY crew_id LIMIT 1")
    .get() as { crew_id: string } | undefined;

  const durationHrs = getBusinessParameter(db, "trip_duration_hrs", 2.5);
  const [y, mo, d] = tripDate.split("-").map(Number);

  const slots: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
  const tripIds: string[] = [];

  const ensureTrip = db.transaction(() => {
    slots.forEach((slot, idx) => {
      const existing = db
        .prepare("SELECT trip_id FROM trips WHERE trip_date = ? AND vessel_id = ? AND slot = ?")
        .get(tripDate, vessel.vessel_id, slot) as { trip_id: string } | undefined;

      if (existing) {
        tripIds.push(existing.trip_id);
        return;
      }

      const startHour = SLOT_START_HOURS[slot];
      const departure = wallClockDate(y, mo - 1, d, startHour, 0, 0);
      const returnTime = new Date(departure.getTime() + durationHrs * 60 * 60 * 1000);

      const tripId = nextId(db, ID_PREFIX.trip, { yearly: true, year });
      const cruiseTypeId = pickCruiseTypeId(cruiseTypes, slot, idx);

      db.prepare(
        `INSERT INTO trips (
           trip_id, trip_date, vessel_id, route_id, cruise_type_id, slot,
           scheduled_departure, scheduled_return, capacity, captain_crew_id, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
      ).run(
        tripId,
        tripDate,
        vessel.vessel_id,
        route.route_id,
        cruiseTypeId,
        slot,
        toDateTimeString(departure),
        toDateTimeString(returnTime),
        vessel.capacity,
        captain?.crew_id ?? null
      );

      tripIds.push(tripId);
    });
  });
  ensureTrip();

  const trips: GeneratedTripPackage[] = [];
  for (const tripId of tripIds) {
    trips.push(await generateTripPackage(tripId));
  }

  return { tripDate, trips };
}

/** Generates a standalone, blank example workbook (no trip context) for the Downloads page. */
export async function generateBlankWorkbook(type: TemplateType): Promise<Buffer> {
  const db = getDb();
  const spec = WORKBOOK_SPECS[type];
  if (!spec) throw new Error(`generateBlankWorkbook: unknown template type '${type}'`);
  const workbook = await buildWorkbook(db, spec, null);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type { TripContext };
export { WORKBOOK_ORDER, WORKBOOK_SPECS };
