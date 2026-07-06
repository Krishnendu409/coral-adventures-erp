import { getDb } from "./client";

/**
 * Wipes all operational and marketing facts from the database, 
 * preserving only core reference data (vessels, users, settings, etc).
 * Used for factory resets and removing synthetic data.
 */
export function productionWipe(): void {
  const db = getDb();
  
  const wipe = db.transaction(() => {
    db.prepare("PRAGMA foreign_keys = OFF;").run();
    const tables = [
      "competitor_prices", "pricing_rules", "archive_manifest", "import_errors",
      "import_batches", "audit_log", "complaints", "feedback", "leads",
      "campaigns", "events", "weather_logs", "inventory_stock_movements",
      "maintenance_records", "expenses", "payments", "bookings", "customers",
      "fuel_logs", "trip_crew_assignments", "trips"
    ];
    for (const table of tables) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
      } catch (e) {}
    }
    db.prepare("PRAGMA foreign_keys = ON;").run();
  });

  wipe();
  console.log("[production-wipe] Operational data wiped successfully.");
}
