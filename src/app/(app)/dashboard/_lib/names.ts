import { getDb } from "@/server/db/client";

/**
 * Small reference-table name lookups for display purposes only (dashboard
 * presentation layer). These are NOT analytics/KPIs — just id -> label maps
 * so tables can show "MV Coral Adventure" instead of "CA-VES-000001". Reads
 * directly from the reference tables (vessels/routes/cruise_types), never
 * derives or caches business figures.
 */

export function getVesselNames(): Record<string, string> {
  const rows = getDb().prepare(`SELECT vessel_id, name FROM vessels`).all() as { vessel_id: string; name: string }[];
  return Object.fromEntries(rows.map((r) => [r.vessel_id, r.name]));
}

export function getRouteNames(): Record<string, string> {
  const rows = getDb().prepare(`SELECT route_id, name FROM routes`).all() as { route_id: string; name: string }[];
  return Object.fromEntries(rows.map((r) => [r.route_id, r.name]));
}

export function getCruiseTypeNames(): Record<string, string> {
  const rows = getDb().prepare(`SELECT cruise_type_id, name FROM cruise_types`).all() as {
    cruise_type_id: string;
    name: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.cruise_type_id, r.name]));
}
