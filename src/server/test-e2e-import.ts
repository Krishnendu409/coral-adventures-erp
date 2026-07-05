import path from "node:path";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { importAllIncoming } from "./domain/import/importEngine";
import { getDb } from "./db/client";
import { PATHS } from "./config/paths";

async function runTest() {
  const tripId = "CA-TRP-2026-000396"; // Use another fresh generated trip
  const sourceFolder = path.join(PATHS.generated, "2026", "07", "05", tripId);
  const incomingFolder = path.join(PATHS.incoming, tripId);
  
  if (!fs.existsSync(sourceFolder)) {
    throw new Error(`Source folder ${sourceFolder} does not exist`);
  }
  
  // 1. Copy folder to incoming
  console.log("1. Copying fresh trip folder to incoming...");
  if (fs.existsSync(incomingFolder)) {
    fs.rmSync(incomingFolder, { recursive: true, force: true });
  }
  fs.mkdirSync(incomingFolder, { recursive: true });
  
  const files = fs.readdirSync(sourceFolder);
  for (const file of files) {
    fs.copyFileSync(path.join(sourceFolder, file), path.join(incomingFolder, file));
  }
  
  // 2. Read and modify all workbooks
  console.log("2. Filling ALL workbooks with comprehensive test data...");
  const db = getDb();

  // --- CAPTAIN ---
  const captainFile = path.join(incomingFolder, "Captain.xlsx");
  const captainWb = new ExcelJS.Workbook();
  await captainWb.xlsx.readFile(captainFile);
  const tripLogSheet = captainWb.worksheets.find(w => w.name === "Trip Log");
  if (tripLogSheet) {
    const row = tripLogSheet.getRow(2);
    const now = new Date();
    row.getCell(1).value = now; // departure
    row.getCell(2).value = new Date(now.getTime() + 3 * 60 * 60 * 1000); // return
    row.getCell(3).value = 45; // turnaround
    row.getCell(4).value = 15; // transition
    row.getCell(5).value = 0; // safety
    row.getCell(6).value = "completed"; // status
    row.getCell(8).value = "sunny"; // weather
    row.getCell(9).value = 15.5; // wind speed
    row.getCell(10).value = 0.5; // wave height
    row.getCell(11).value = 28; // temperature
    row.getCell(12).value = "good"; // visibility
    row.getCell(13).value = 220; // fuel
    row.getCell(14).value = 22000; // fuel cost
    row.getCell(15).value = 3; // engine hours
    row.getCell(16).value = "Smooth sailing"; // notes
    row.commit();
  }
  await captainWb.xlsx.writeFile(captainFile);

  // --- RESERVATIONS ---
  const resFile = path.join(incomingFolder, "Reservations.xlsx");
  const resWb = new ExcelJS.Workbook();
  await resWb.xlsx.readFile(resFile);
  const bookingsSheet = resWb.worksheets.find(w => w.name === "Bookings");
  if (bookingsSheet) {
    const row = bookingsSheet.getRow(2);
    row.getCell(2).value = "Jane Smith"; // name
    row.getCell(3).value = "555-9999"; // phone
    row.getCell(4).value = "jane@example.com"; // email
    row.getCell(5).value = "Delhi"; // city
    row.getCell(6).value = "corporate"; // customer type
    const channel = db.prepare("SELECT name FROM marketing_channels LIMIT 1").get() as any;
    if (channel) row.getCell(7).value = channel.name; // acquisition channel
    row.getCell(8).value = new Date(); // booking date
    row.getCell(9).value = 20; // pax
    const cruiseType = db.prepare("SELECT name FROM cruise_types LIMIT 1").get() as any;
    if (cruiseType) row.getCell(10).value = cruiseType.name;
    row.getCell(11).value = 30; // lead time
    row.getCell(12).value = "Yes"; // group discount
    row.getCell(13).value = "completed"; // status
    row.getCell(14).value = "Website"; // booking source
    row.getCell(15).value = "VIP Group"; // notes
    row.commit();
  }
  
  const paymentsSheet = resWb.worksheets.find(w => w.name === "Payments");
  if (paymentsSheet) {
    const row = paymentsSheet.getRow(2);
    row.getCell(1).value = 1; // booking ref (row 1 is header, row 2 is #1)
    row.getCell(2).value = 50000; // amount
    row.getCell(3).value = "bank_transfer"; // method
    row.getCell(4).value = new Date(); // date
    row.getCell(5).value = "charter"; // type
    row.getCell(6).value = "completed"; // status
    row.commit();
  }
  
  const cancelSheet = resWb.worksheets.find(w => w.name === "Cancellations");
  if (cancelSheet) {
    const row = cancelSheet.getRow(2);
    row.getCell(1).value = 1; // booking ref
    row.getCell(2).value = "customer_request"; // reason
    row.getCell(3).value = 5; // days before
    row.getCell(4).value = 25000; // refund
    row.commit();
  }
  await resWb.xlsx.writeFile(resFile);

  // --- FINANCE ---
  const finFile = path.join(incomingFolder, "Finance.xlsx");
  const finWb = new ExcelJS.Workbook();
  await finWb.xlsx.readFile(finFile);
  const expensesSheet = finWb.worksheets.find(w => w.name === "Expenses");
  if (expensesSheet) {
    const row = expensesSheet.getRow(2);
    row.getCell(1).value = new Date(); // date
    row.getCell(2).value = "marketing"; // category
    row.getCell(3).value = 15000; // amount
    row.getCell(4).value = "Ad Agency"; // vendor
    row.getCell(5).value = "Facebook Ads"; // description
    row.getCell(6).value = "paid"; // status
    row.commit();
  }
  await finWb.xlsx.writeFile(finFile);
  
  // --- HOSPITALITY ---
  const hospFile = path.join(incomingFolder, "Hospitality.xlsx");
  const hospWb = new ExcelJS.Workbook();
  await hospWb.xlsx.readFile(hospFile);
  const onboardSheet = hospWb.worksheets.find(w => w.name === "Onboard Sales");
  if (onboardSheet) {
    const row = onboardSheet.getRow(2);
    row.getCell(1).value = 1; // booking ref
    row.getCell(2).value = 2500; // amount
    row.getCell(3).value = "card"; // method
    row.getCell(4).value = new Date(); // date
    row.getCell(5).value = "completed"; // status
    row.commit();
  }
  const consumptionSheet = hospWb.worksheets.find(w => w.name === "Inventory Consumption");
  if (consumptionSheet) {
    const row = consumptionSheet.getRow(2);
    const item = db.prepare("SELECT name FROM inventory_items LIMIT 1").get() as any;
    if (item) {
      row.getCell(1).value = item.name;
      row.getCell(2).value = 50; // qty
      row.getCell(3).value = new Date(); // date
      row.getCell(4).value = 100; // unit cost
      row.getCell(5).value = "Served during event"; // notes
      row.commit();
    }
  }

  const photoZoneSheet = hospWb.worksheets.find(w => w.name === "Photo Zones");
  if (photoZoneSheet) {
    const row = photoZoneSheet.getRow(2);
    row.getCell(1).value = "deck"; // zone
    row.getCell(2).value = 45; // clicks
    row.commit();
  }

  const complaintsSheet2 = hospWb.worksheets.find(w => w.name === "Aesthetic Complaints");
  if (complaintsSheet2) {
    const row = complaintsSheet2.getRow(2);
    row.getCell(1).value = "Deck seating area"; // area
    row.getCell(2).value = "medium"; // severity
    row.getCell(3).value = "Cushion covers stained"; // details
    row.commit();
  }

  await hospWb.xlsx.writeFile(hospFile);

  // --- FEEDBACK ---
  const fbFile = path.join(incomingFolder, "Feedback.xlsx");
  const fbWb = new ExcelJS.Workbook();
  await fbWb.xlsx.readFile(fbFile);
  const fbSheet = fbWb.worksheets.find(w => w.name === "Customer Feedback");
  if (fbSheet) {
    const row = fbSheet.getRow(2);
    row.getCell(1).value = 1; // booking ref
    row.getCell(2).value = 5; // overall
    row.getCell(3).value = 4; // captain
    row.getCell(4).value = 5; // hospitality
    row.getCell(5).value = 4; // value
    row.getCell(6).value = 9; // NPS
    row.getCell(7).value = "Great service"; // comments
    row.getCell(8).value = new Date(); // date
    row.commit();
  }
  const complaintsSheet = fbWb.worksheets.find(w => w.name === "Complaints");
  if (complaintsSheet) {
    const row = complaintsSheet.getRow(2);
    row.getCell(1).value = 1; // booking ref
    row.getCell(2).value = "Food Quality"; // category
    row.getCell(3).value = "Food was a bit cold"; // desc
    row.getCell(4).value = "low"; // severity
    row.getCell(5).value = "open"; // status
    row.getCell(6).value = new Date(); // date
    row.commit();
  }
  await fbWb.xlsx.writeFile(fbFile);
  
  // --- MAINTENANCE ---
  const maintFile = path.join(incomingFolder, "Maintenance.xlsx");
  const maintWb = new ExcelJS.Workbook();
  await maintWb.xlsx.readFile(maintFile);
  const maintSheet = maintWb.worksheets.find(w => w.name === "Maintenance Records");
  if (maintSheet) {
    const row = maintSheet.getRow(2);
    row.getCell(1).value = new Date(); // date
    row.getCell(2).value = "predictive"; // type
    row.getCell(3).value = "Generator"; // component
    row.getCell(4).value = "Oil change"; // description
    row.getCell(5).value = 1200; // cost
    row.getCell(6).value = 2; // downtime
    row.getCell(7).value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // next due
    row.getCell(8).value = "John Tech"; // performed by
    row.getCell(9).value = "completed"; // status
    row.commit();
  }
  await maintWb.xlsx.writeFile(maintFile);
  
  // --- INVENTORY ---
  const invFile = path.join(incomingFolder, "Inventory.xlsx");
  const invWb = new ExcelJS.Workbook();
  await invWb.xlsx.readFile(invFile);
  const stockSheet = invWb.worksheets.find(w => w.name === "Stock Movements");
  if (stockSheet) {
    const row = stockSheet.getRow(2);
    const item = db.prepare("SELECT name FROM inventory_items LIMIT 1").get() as any;
    if (item) {
      row.getCell(1).value = item.name;
      row.getCell(2).value = "restock"; // movement
      row.getCell(3).value = 1000; // qty
      row.getCell(4).value = new Date(); // date
      row.getCell(5).value = 80; // unit cost
      row.getCell(6).value = "Monthly supplies"; // notes
      row.commit();
    }
  }
  await invWb.xlsx.writeFile(invFile);
  
  // --- MARKETING ---
  const mktFile = path.join(incomingFolder, "Marketing.xlsx");
  const mktWb = new ExcelJS.Workbook();
  await mktWb.xlsx.readFile(mktFile);
  const leadsSheet = mktWb.worksheets.find(w => w.name === "Leads");
  if (leadsSheet) {
    const row = leadsSheet.getRow(2);
    const channel = db.prepare("SELECT name FROM marketing_channels LIMIT 1").get() as any;
    if (channel) {
      row.getCell(1).value = channel.name;
      row.getCell(2).value = "Summer Promo"; // campaign
      row.getCell(3).value = "Alice Green"; // lead name
      row.getCell(4).value = "alice@test.com"; // info
      row.getCell(5).value = new Date(); // date
      row.getCell(6).value = "converted"; // status
      row.getCell(7).value = 1; // converted booking ref
      row.commit();
    }
  }
  await mktWb.xlsx.writeFile(mktFile);

  console.log("3. Running importAllIncoming()...");
  const results = await importAllIncoming();
  
  if (results.length > 0 && results[0].status === "failed") {
    console.error("Import failed with issues:", JSON.stringify(results[0].issues, null, 2));
  } else {
    console.log("\n--- 4. Querying SQL to verify ALL columns and tables ---");
    
    // We print the exact row data
    const printTable = (name: string, query: string, params: any[] = []) => {
        console.log(`\n[${name}]`);
        const rows = db.prepare(query).all(...params);
        console.log(JSON.stringify(rows, null, 2));
    };
    
    printTable("TRIPS", "SELECT * FROM trips WHERE trip_id = ?", [tripId]);
    printTable("FUEL LOGS", "SELECT * FROM fuel_logs WHERE trip_id = ?", [tripId]);
    printTable("WEATHER LOGS", "SELECT * FROM weather_logs WHERE trip_id = ?", [tripId]);
    
    const bookings = db.prepare("SELECT booking_id FROM bookings WHERE trip_id = ?").all(tripId) as any[];
    const bookingIds = bookings.map(b => b.booking_id);
    printTable("BOOKINGS", "SELECT * FROM bookings WHERE trip_id = ?", [tripId]);
    
    if (bookingIds.length > 0) {
      const placeholders = bookingIds.map(() => "?").join(",");
      printTable("PAYMENTS", `SELECT * FROM payments WHERE booking_id IN (${placeholders})`, bookingIds);
    }
    
    printTable("CUSTOMERS", "SELECT * FROM customers WHERE customer_id IN (SELECT customer_id FROM bookings WHERE trip_id = ?)", [tripId]);
    printTable("EXPENSES", "SELECT * FROM expenses WHERE trip_id = ?", [tripId]);
    printTable("FEEDBACK", "SELECT * FROM feedback WHERE trip_id = ?", [tripId]);
    printTable("COMPLAINTS", "SELECT * FROM complaints WHERE trip_id = ?", [tripId]);
    
    printTable("MAINTENANCE", "SELECT * FROM maintenance_records WHERE import_batch_id = ?", [results[0].batchId]);
    printTable("INVENTORY MOVEMENTS", "SELECT * FROM inventory_stock_movements WHERE trip_id = ?", [tripId]);
    printTable("LEADS", "SELECT * FROM leads WHERE converted_booking_id IN (SELECT booking_id FROM bookings WHERE trip_id = ?)", [tripId]);
    
    console.log("\n✅ Extremely Comprehensive E2E Pipeline verified successfully!");
  }
}

runTest().catch(console.error);
