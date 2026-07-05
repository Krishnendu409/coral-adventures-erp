import type Database from "better-sqlite3";
import type { LookupTable } from "./sheetSpecs";

export interface TripContext {
  tripId: string;
  tripDate: string; // YYYY-MM-DD
  slot: "morning" | "afternoon" | "evening";
  scheduledDeparture: string;
  scheduledReturn: string;
  capacity: number;
  status: string;
  vesselId: string;
  vesselName: string;
  routeId: string;
  routeName: string;
  cruiseTypeId: string;
  cruiseTypeName: string;
  captainCrewId: string | null;
  captainName: string | null;
}

interface TripContextRow {
  trip_id: string;
  trip_date: string;
  slot: "morning" | "afternoon" | "evening";
  scheduled_departure: string;
  scheduled_return: string;
  capacity: number;
  status: string;
  vessel_id: string;
  vessel_name: string;
  route_id: string;
  route_name: string;
  cruise_type_id: string;
  cruise_type_name: string;
  captain_crew_id: string | null;
  captain_name: string | null;
}

/** Loads the live trip context (vessel/route/cruise type/captain) for a given trip_id. Throws if the trip doesn't exist. */
export function loadTripContext(db: Database.Database, tripId: string): TripContext {
  const row = db
    .prepare(
      `SELECT
         t.trip_id, t.trip_date, t.slot, t.scheduled_departure, t.scheduled_return, t.capacity, t.status,
         t.vessel_id, v.name AS vessel_name,
         t.route_id, r.name AS route_name,
         t.cruise_type_id, c.name AS cruise_type_name,
         t.captain_crew_id, cr.full_name AS captain_name
       FROM trips t
       JOIN vessels v ON v.vessel_id = t.vessel_id
       JOIN routes r ON r.route_id = t.route_id
       JOIN cruise_types c ON c.cruise_type_id = t.cruise_type_id
       LEFT JOIN crew cr ON cr.crew_id = t.captain_crew_id
       WHERE t.trip_id = ?`
    )
    .get(tripId) as TripContextRow | undefined;

  if (!row) {
    throw new Error(`loadTripContext: no trip found for trip_id '${tripId}'`);
  }

  return {
    tripId: row.trip_id,
    tripDate: row.trip_date,
    slot: row.slot,
    scheduledDeparture: row.scheduled_departure,
    scheduledReturn: row.scheduled_return,
    capacity: row.capacity,
    status: row.status,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name,
    routeId: row.route_id,
    routeName: row.route_name,
    cruiseTypeId: row.cruise_type_id,
    cruiseTypeName: row.cruise_type_name,
    captainCrewId: row.captain_crew_id,
    captainName: row.captain_name,
  };
}

const LOOKUP_QUERIES: Record<LookupTable, string> = {
  marketing_channels: "SELECT name FROM marketing_channels WHERE is_active = 1 ORDER BY name",
  cruise_types: "SELECT name FROM cruise_types ORDER BY name",
  inventory_items: "SELECT name FROM inventory_items WHERE status = 'active' ORDER BY name",
};

/** Live list of names for a dynamic dropdown (marketing channels, cruise types, inventory items). May be empty on a freshly-seeded DB. */
export function getLookupNames(db: Database.Database, table: LookupTable): string[] {
  return (db.prepare(LOOKUP_QUERIES[table]).all() as Array<{ name: string }>).map((r) => r.name);
}

const LOOKUP_ID_COLUMN: Record<LookupTable, string> = {
  marketing_channels: "channel_id",
  cruise_types: "cruise_type_id",
  inventory_items: "item_id",
};

/** Resolves a lookup column's free-text value to its DB id by case-insensitive name match. Returns null if not found. */
export function resolveLookupId(db: Database.Database, table: LookupTable, name: string): string | null {
  const idColumn = LOOKUP_ID_COLUMN[table];
  const row = db
    .prepare(`SELECT ${idColumn} AS id FROM ${table} WHERE lower(name) = lower(?)`)
    .get(name.trim()) as { id: string } | undefined;
  return row ? row.id : null;
}
