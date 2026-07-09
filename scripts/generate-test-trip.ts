/**
 * scripts/generate-test-trip.ts
 *
 * End-to-end test script that:
 * 1. Queries the DB to find the vessel and cruise types
 * 2. Creates a trip record for a past date in the DB (or finds existing)
 * 3. Generates Excel workbooks (Captain + Finance + Reservations) filled with realistic random data
 * 4. Places them in incoming/<tripId>/ folder
 * 5. Calls the import API to ingest them
 * 6. Reports the result
 *
 * Run from: system/ directory
 *   npx tsx scripts/generate-test-trip.ts
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

// ─── paths ────────────────────────────────────────────────────────────────────
// Must match src/server/config/paths.ts: BUSINESS_ROOT is one level up from system/
const SYSTEM_DIR = path.resolve(__dirname, "..");
const BUSINESS_ROOT = path.resolve(SYSTEM_DIR, "..");
const DATA_ROOT = path.join(SYSTEM_DIR, "data");
const INCOMING = path.join(BUSINESS_ROOT, "incoming");
const DB_FILE = path.join(DATA_ROOT, "database", "coral_adventures.sqlite3");

// ─── DB helper (native sqlite, same as the app uses) ─────────────────────────
// @ts-ignore
import { DatabaseSync } from "node:sqlite";

function openDb() {
  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

// ─── random helpers ───────────────────────────────────────────────────────────
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(rnd(6, 9), 0, 0, 0);
  return d;
}
function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600_000);
}
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

// ─── Indian names for test data ───────────────────────────────────────────────
const NAMES = [
  "Arjun Sharma", "Priya Patel", "Rahul Nair", "Ananya Reddy",
  "Vikram Singh", "Deepika Menon", "Kiran Kumar", "Sunita Iyer",
  "Rajesh Gupta", "Meera Krishnan", "Suresh Babu", "Kavitha Pillai",
  "Anil Verma", "Pooja Joshi", "Sanjay Rao", "Lalitha Devi",
  "Manish Tiwari", "Radha Nambiar", "Vivek Shetty", "Sneha Kulkarni",
];
const CITIES = ["Udupi", "Mangalore", "Bangalore", "Mumbai", "Pune", "Hyderabad", "Kochi", "Chennai"];
const PHONES = () => `9${rnd(100000000, 999999999)}`;

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Coral Adventures — Test Trip Generator     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 1. Open DB and read required reference data
  console.log("📋 Reading database...");
  const db = openDb();

  const vessel = db.prepare("SELECT * FROM vessels LIMIT 1").get() as any;
  if (!vessel) {
    console.error("❌ No vessel found. Please run: npm run db:seed");
    process.exit(1);
  }

  const cruiseTypes = db.prepare("SELECT * FROM cruise_types").all() as any[];
  if (cruiseTypes.length === 0) {
    console.error("❌ No cruise types found. Please run: npm run db:seed");
    process.exit(1);
  }

  const route = db.prepare("SELECT * FROM routes LIMIT 1").get() as any;
  if (!route) {
    console.error("❌ No routes found. Please run: npm run db:seed");
    process.exit(1);
  }

  const channels = db.prepare("SELECT name FROM marketing_channels LIMIT 5").all() as any[];
  const channelNames = channels.map((c: any) => c.name);

  console.log(`✅ Vessel: ${vessel.name} (capacity: ${vessel.capacity})`);
  console.log(`✅ Cruise types: ${cruiseTypes.map((c: any) => c.name).join(", ")}`);
  console.log(`✅ Route: ${route.name}`);

  // 2. Choose a trip date (7 days ago so it's clearly in the past)
  const daysAgo = rnd(3, 14);
  const tripDate = fmtDate(new Date(Date.now() - daysAgo * 86400_000));
  console.log(`\n📅 Trip date: ${tripDate} (${daysAgo} days ago)`);

  // 3. Find or create a trip record in DB for that date
  let trip = db.prepare(
    "SELECT * FROM trips WHERE trip_date = ? AND vessel_id = ? AND status = 'scheduled'"
  ).get(tripDate, vessel.vessel_id) as any;

  if (!trip) {
    // Generate next trip_id manually
    const lastTrip = db.prepare("SELECT trip_id FROM trips ORDER BY trip_id DESC LIMIT 1").get() as any;
    let nextNum = 1;
    if (lastTrip?.trip_id) {
      const match = lastTrip.trip_id.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const year = new Date().getFullYear();
    const tripId = `CA-TRP-${year}-${String(nextNum).padStart(6, "0")}`;

    const stdType = cruiseTypes.find((c: any) => c.name.toLowerCase().includes("standard")) || cruiseTypes[0];
    db.prepare(
      `INSERT INTO trips (trip_id, trip_date, vessel_id, route_id, cruise_type_id, slot, scheduled_departure, scheduled_return, status, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`
    ).run(
      tripId,
      tripDate,
      vessel.vessel_id,
      route.route_id,
      stdType.cruise_type_id,
      'morning',
      `${tripDate}T09:00:00`,
      `${tripDate}T11:30:00`,
      vessel.capacity
    );

    trip = db.prepare("SELECT * FROM trips WHERE trip_id = ?").get(tripId) as any;
    console.log(`✅ Created trip: ${trip.trip_id}`);
  } else {
    console.log(`✅ Using existing trip: ${trip.trip_id}`);
  }

  const tripId: string = trip.trip_id;
  const tripFolder = path.join(INCOMING, tripId);
  fs.mkdirSync(tripFolder, { recursive: true });
  console.log(`\n📁 Folder: ${tripFolder}`);

  // 4. Choose a cruise type for all bookings
  const chosenCruiseType = cruiseTypes[rnd(0, cruiseTypes.length - 1)];
  const numPassengers = rnd(8, Math.min(25, vessel.capacity));
  const numBookings = rnd(4, Math.min(numPassengers, 12));

  // ─── Build Captain.xlsx ────────────────────────────────────────────────────
  console.log("\n📄 Generating Captain.xlsx...");
  const departure = randomDate(daysAgo);
  departure.setHours(9, 0, 0, 0);
  const returnTime = addHours(departure, 2.5);

  const captainWb = new ExcelJS.Workbook();

  // Sheet 1: Trip Log
  const tripLogSheet = captainWb.addWorksheet("Trip Log");
  tripLogSheet.columns = [
    { header: "Actual Departure *", key: "departure", width: 22 },
    { header: "Actual Return *", key: "return", width: 22 },
    { header: "Turnaround Time (Mins)", key: "turnaround", width: 22 },
    { header: "Transition Time (Mins)", key: "transition", width: 22 },
    { header: "Safety Incidents Count *", key: "incidents", width: 25 },
    { header: "Trip Status *", key: "status", width: 15 },
    { header: "Cancellation Reason (if cancelled)", key: "cancel_reason", width: 35 },
    { header: "Weather Condition *", key: "weather", width: 20 },
    { header: "Wind Speed (km/h)", key: "wind", width: 18 },
    { header: "Wave Height (m)", key: "wave", width: 16 },
    { header: "Temperature (C)", key: "temp", width: 15 },
    { header: "Visibility", key: "visibility", width: 15 },
    { header: "Fuel Consumed (Liters) *", key: "liters", width: 24 },
    { header: "Fuel Cost (INR) *", key: "fuel_cost", width: 18 },
    { header: "Engine Hours *", key: "engine_hours", width: 15 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  tripLogSheet.addRow({
    departure: departure,
    return: returnTime,
    turnaround: 20,
    transition: 15,
    incidents: 0,
    status: "completed",
    cancel_reason: "",
    weather: pick(["clear", "partly_cloudy", "cloudy"]),
    wind: rnd(5, 25),
    wave: (rnd(1, 8) / 10).toFixed(1),
    temp: rnd(26, 34),
    visibility: "good",
    liters: rnd(60, 100),
    fuel_cost: rnd(5000, 8500),
    engine_hours: 3.5,
    notes: "Smooth trip, passengers happy.",
  });
  const depCell = tripLogSheet.getCell("A2");
  depCell.numFmt = "yyyy-mm-dd hh:mm";
  const retCell = tripLogSheet.getCell("B2");
  retCell.numFmt = "yyyy-mm-dd hh:mm";

  // Sheet 2: Safety Incidents (empty - no incidents)
  const safetySheet = captainWb.addWorksheet("Safety Incidents");
  safetySheet.columns = [
    { header: "Incident Type *", key: "type", width: 22 },
    { header: "Severity *", key: "severity", width: 15 },
    { header: "Description *", key: "desc", width: 40 },
  ];

  await captainWb.xlsx.writeFile(path.join(tripFolder, "Captain.xlsx"));
  console.log("   ✅ Captain.xlsx written");

  // ─── Build Finance.xlsx ────────────────────────────────────────────────────
  console.log("📄 Generating Finance.xlsx...");
  const financeWb = new ExcelJS.Workbook();

  const expSheet = financeWb.addWorksheet("Expenses");
  expSheet.columns = [
    { header: "Expense Date *", key: "date", width: 16 },
    { header: "Category *", key: "category", width: 18 },
    { header: "Amount (INR) *", key: "amount", width: 16 },
    { header: "Vendor Name", key: "vendor", width: 24 },
    { header: "Description", key: "desc", width: 30 },
    { header: "Payment Status", key: "pay_status", width: 18 },
  ];
  const tripDateObj = new Date(tripDate + "T00:00:00");
  expSheet.addRow({ date: tripDateObj, category: "fuel", amount: rnd(5000, 8500), vendor: "IOC Petrol Bunk", desc: "Diesel for trip", pay_status: "paid" });
  expSheet.addRow({ date: tripDateObj, category: "port_fees", amount: rnd(800, 1500), vendor: "Malpe Port Authority", desc: "Berth charges", pay_status: "paid" });
  if (rnd(0, 1)) {
    expSheet.addRow({ date: tripDateObj, category: "other", amount: rnd(200, 600), vendor: "Local Store", desc: "Safety equipment restock", pay_status: "paid" });
  }

  await financeWb.xlsx.writeFile(path.join(tripFolder, "Finance.xlsx"));
  console.log("   ✅ Finance.xlsx written");

  // ─── Build Reservations.xlsx ───────────────────────────────────────────────
  console.log("📄 Generating Reservations.xlsx...");
  const resWb = new ExcelJS.Workbook();

  // Bookings sheet
  const bookingsSheet = resWb.addWorksheet("Bookings");
  bookingsSheet.columns = [
    { header: "Booking #", key: "booking_num", width: 12 },
    { header: "Customer Full Name *", key: "name", width: 26 },
    { header: "Phone *", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "City", key: "city", width: 16 },
    { header: "Customer Type", key: "ctype", width: 18 },
    { header: "Acquisition Channel", key: "channel", width: 26 },
    { header: "Booking Date *", key: "bdate", width: 16 },
    { header: "Passenger Count *", key: "pax", width: 18 },
    { header: "Cruise Type *", key: "cruise_type", width: 20 },
    { header: "Lead Time (Days)", key: "lead_time", width: 18 },
    { header: "Group Discount Applied", key: "grp_discount", width: 24 },
    { header: "Status", key: "status", width: 14 },
    { header: "Booking Source", key: "source", width: 20 },
    { header: "Notes", key: "notes", width: 30 },
  ];

  const bookings: any[] = [];
  for (let i = 0; i < numBookings; i++) {
    const pax = rnd(1, 4);
    const leadDays = rnd(0, 21);
    const bDate = new Date(tripDate + "T00:00:00");
    bDate.setDate(bDate.getDate() - leadDays);
    bookings.push({
      booking_num: i + 1,
      name: pick(NAMES),
      phone: PHONES(),
      email: `customer${i + 1}@example.com`,
      city: pick(CITIES),
      ctype: pick(["individual", "individual", "corporate"]),
      channel: channelNames.length > 0 ? pick(channelNames) : "",
      bdate: bDate,
      pax,
      cruise_type: chosenCruiseType.name,
      lead_time: leadDays,
      grp_discount: pax >= 3 ? "Yes" : "No",
      status: "confirmed",
      source: pick(["Walk-in", "WhatsApp", "Phone", "Website"]),
      notes: "",
    });
    bookingsSheet.addRow(bookings[bookings.length - 1]);
  }

  // Payments sheet
  const paymentsSheet = resWb.addWorksheet("Payments");
  paymentsSheet.columns = [
    { header: "Booking # (from Bookings sheet) *", key: "booking_ref", width: 30 },
    { header: "Amount (INR) *", key: "amount", width: 16 },
    { header: "Payment Method *", key: "method", width: 20 },
    { header: "Payment Date *", key: "pdate", width: 16 },
    { header: "Payment Type *", key: "ptype", width: 18 },
    { header: "Status", key: "status", width: 14 },
  ];
  for (const b of bookings) {
    const ticketAmount = Math.round(chosenCruiseType.base_price_inr * b.pax * (b.grp_discount === "Yes" ? 0.9 : 1));
    paymentsSheet.addRow({
      booking_ref: b.booking_num,
      amount: ticketAmount,
      method: pick(["cash", "upi", "card"]),
      pdate: b.bdate,
      ptype: "ticket",
      status: "completed",
    });
  }

  // Cancellations sheet (empty)
  const cancelSheet = resWb.addWorksheet("Cancellations");
  cancelSheet.columns = [
    { header: "Booking #", key: "booking_ref", width: 14 },
    { header: "Cancellation Reason *", key: "reason", width: 26 },
    { header: "Days Before Departure *", key: "days", width: 24 },
    { header: "Refund Amount (INR)", key: "refund", width: 20 },
  ];

  await resWb.xlsx.writeFile(path.join(tripFolder, "Reservations.xlsx"));
  console.log("   ✅ Reservations.xlsx written");

  console.log(`\n📦 ${numBookings} bookings, ${numPassengers} passengers, cruise type: ${chosenCruiseType.name}`);

  // 5. Trigger import via HTTP API (try 3001 first, fallback to 3000)
  console.log("\n🚀 Triggering import...");
  const PORTS = [3001, 3000];
  let importDone = false;
  for (const port of PORTS) {
    try {
      const resp = await fetch(`http://localhost:${port}/api/import/run`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json() as any;
        const result = data.results?.find((r: any) => r.tripId === tripId);
        if (result) {
          if (result.status === "committed") {
            console.log(`\n✅ Import SUCCESSFUL for trip ${tripId}! (via port ${port})`);
            console.log("   Analytics dashboard should now show updated data.");
            if (result.issues?.length > 0) {
              console.log(`   ⚠️  ${result.issues.length} non-fatal warning(s):`);
              result.issues.forEach((i: any) => console.log(`      - ${i.errorMessage}`));
            }
          } else {
            console.log(`\n❌ Import FAILED for trip ${tripId}:`);
            result.issues?.forEach((i: any) => console.log(`   - [${i.severity}] ${i.errorMessage}`));
          }
        } else {
          console.log(`\n⚠️  Trip not in results on port ${port}. Results:`, JSON.stringify(data.results));
        }
        importDone = true;
        break;
      }
    } catch {
      // try next port
    }
  }
  if (!importDone) {
    console.log(`\n⚠️  Could not reach the import API on ports 3000 or 3001.`);
    console.log("   Files have been placed in incoming/ folder.");
    console.log("   Start the app (start.bat or npm run dev) and use the Import page to ingest them.");
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Trip ID: ${tripId}`);
  console.log(`  Folder:  ${tripFolder}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
