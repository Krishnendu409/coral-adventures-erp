import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PATHS } from "../src/server/config/paths";

async function main() {
  
  // Find a generated trip folder
  const tripIds = fs.readdirSync(path.join(PATHS.generated, "2026", "07", "07"));
  if (tripIds.length === 0) throw new Error("No generated trips found");
  
  const tripId = tripIds[0];
  const sourceFolder = path.join(PATHS.generated, "2026", "07", "07", tripId);
  const destFolder = path.join(PATHS.incoming, tripId);
  
  // Copy all files to incoming
  fs.mkdirSync(destFolder, { recursive: true });
  const files = fs.readdirSync(sourceFolder);
  for (const file of files) {
    fs.copyFileSync(path.join(sourceFolder, file), path.join(destFolder, file));
  }

  // 1. Fill Captain.xlsx -> Trip Log
  console.log("Filling Captain.xlsx...");
  const captainPath = path.join(destFolder, "Captain.xlsx");
  const captainWb = new ExcelJS.Workbook();
  await captainWb.xlsx.readFile(captainPath);
  const tripLogSheet = captainWb.getWorksheet("Trip Log");
  if (!tripLogSheet) throw new Error("No Trip Log sheet");
  
  // The first data row is row 2 (headers are row 1)
  const captainRow = tripLogSheet.getRow(2);
  captainRow.getCell(1).value = new Date("2026-07-07T08:00:00Z"); // actual_departure
  captainRow.getCell(2).value = new Date("2026-07-07T12:00:00Z"); // actual_return
  captainRow.getCell(3).value = 30; // turnaround
  captainRow.getCell(4).value = 15; // transition
  captainRow.getCell(5).value = 0; // safety_incidents
  captainRow.getCell(6).value = "completed"; // status
  captainRow.getCell(7).value = null; // cancellation
  captainRow.getCell(8).value = "Clear"; // weather
  captainRow.getCell(9).value = 10; // wind
  captainRow.getCell(10).value = 0.5; // wave
  captainRow.getCell(11).value = 28; // temp
  captainRow.getCell(12).value = "Good"; // visibility
  captainRow.getCell(13).value = 150; // liters consumed
  captainRow.getCell(14).value = 15000; // fuel cost
  captainRow.getCell(15).value = 4; // engine hours
  captainRow.getCell(16).value = "Test trip"; // notes
  captainRow.commit();
  await captainWb.xlsx.writeFile(captainPath);

  // 2. Fill Finance.xlsx (Required) -> Expenses
  console.log("Filling Finance.xlsx...");
  const financePath = path.join(destFolder, "Finance.xlsx");
  const financeWb = new ExcelJS.Workbook();
  await financeWb.xlsx.readFile(financePath);
  const expensesSheet = financeWb.getWorksheet("Expenses");
  if (!expensesSheet) throw new Error("No Expenses sheet");
  
  const financeRow = expensesSheet.getRow(2);
  financeRow.getCell(1).value = new Date("2026-07-07T12:00:00Z"); // expense date
  financeRow.getCell(2).value = "maintenance"; // category
  financeRow.getCell(3).value = 5000; // amount inr
  financeRow.getCell(4).value = "Test Vendor"; // vendor
  financeRow.getCell(5).value = "Test desc"; // desc
  financeRow.getCell(6).value = "paid"; // status
  financeRow.commit();
  await financeWb.xlsx.writeFile(financePath);

  console.log(`Running POST /api/import...`);
  const response = await fetch("http://localhost:3000/api/import/run", { method: "POST" });
  const results = await response.json();
  console.log(JSON.stringify(results, null, 2));

  console.log("Check analytics dashboard in browser to see the imported data!");
}

main().catch(console.error);
