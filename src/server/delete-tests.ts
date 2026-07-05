import { getDb } from "./db/client";

const db = getDb();
const tripsToDelete = ['CA-TRP-2026-000394', 'CA-TRP-2026-000395', 'CA-TRP-2026-000396'];
const placeholders = tripsToDelete.map(() => '?').join(',');

db.transaction(() => {
  console.log("Deleting payments...");
  db.prepare(`DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE trip_id IN (${placeholders}))`).run(...tripsToDelete);
  
  console.log("Deleting leads...");
  db.prepare(`DELETE FROM leads WHERE converted_booking_id IN (SELECT booking_id FROM bookings WHERE trip_id IN (${placeholders}))`).run(...tripsToDelete);

  console.log("Deleting bookings...");
  db.prepare(`DELETE FROM bookings WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting feedback...");
  db.prepare(`DELETE FROM feedback WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting complaints...");
  db.prepare(`DELETE FROM complaints WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);
  
  // Customers that were created during these trips
  console.log("Deleting test customers...");
  db.prepare(`DELETE FROM customers WHERE customer_id NOT IN (SELECT customer_id FROM bookings) AND first_trip_date = '2026-07-05'`).run();

  console.log("Deleting expenses...");
  db.prepare(`DELETE FROM expenses WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting fuel logs...");
  db.prepare(`DELETE FROM fuel_logs WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting weather logs...");
  db.prepare(`DELETE FROM weather_logs WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting inventory stock movements...");
  db.prepare(`DELETE FROM inventory_stock_movements WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting maintenance records...");
  db.prepare(`DELETE FROM maintenance_records WHERE import_batch_id IN (SELECT batch_id FROM import_batches WHERE trip_folder_name IN (${placeholders}))`).run(...tripsToDelete);

  console.log("Deleting archive manifest...");
  db.prepare(`DELETE FROM archive_manifest WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting import errors...");
  db.prepare(`DELETE FROM import_errors WHERE batch_id IN (SELECT batch_id FROM import_batches WHERE trip_folder_name IN (${placeholders}))`).run(...tripsToDelete);

  console.log("Deleting import batches...");
  db.prepare(`DELETE FROM import_batches WHERE trip_folder_name IN (${placeholders})`).run(...tripsToDelete);

  console.log("Deleting audit logs...");
  db.prepare(`DELETE FROM audit_log WHERE entity_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Resetting trips...");
  db.prepare(`UPDATE trips SET status = 'scheduled', actual_departure = NULL, actual_return = NULL, cancellation_reason = NULL, import_batch_id = NULL, notes = NULL WHERE trip_id IN (${placeholders})`).run(...tripsToDelete);

  console.log("Successfully cleaned up test data!");
})();
