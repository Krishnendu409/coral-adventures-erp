import ExcelJS from "exceljs";
import { getConfig } from "../settings/configRepository";
type Database = any;
import type { ColumnSpec, SheetSpec, WorkbookSpec } from "./sheetSpecs";
import type { TripContext } from "./tripContext";
import { getLookupNames } from "./tripContext";

/**
 * Not a secret — sheet protection here exists purely to stop a crew member
 * from accidentally overtyping a locked header/context cell, not to guard
 * anything sensitive. A fixed, publicly-known password is fine.
 */
const SHEET_LOCK_PASSWORD = "coral-locked";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3B4D" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6F8" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: "FF1F3B4D" } };
const LABEL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF444444" } };

/**
 * Manages a single hidden "Lists" worksheet that backs every dropdown in the
 * workbook. A hidden helper sheet + range reference is used (instead of an
 * inline comma-list formula) because some dropdowns — marketing channel
 * names in particular — comfortably exceed Excel's ~255 character inline
 * list-formula limit.
 */
class ListRegistry {
  private sheet: ExcelJS.Worksheet | undefined;
  private columns = new Map<string, number>();

  constructor(private workbook: ExcelJS.Workbook) {}

  /** Returns a data-validation formula (no leading "=") for the given values, or null if there are no values to offer. */
  reference(name: string, values: readonly string[]): string | null {
    if (values.length === 0) return null;

    if (!this.sheet) {
      this.sheet = this.workbook.addWorksheet("Lists", { state: "veryHidden" });
    }

    let colIndex = this.columns.get(name);
    if (!colIndex) {
      colIndex = this.columns.size + 1;
      this.columns.set(name, colIndex);
      const column = this.sheet.getColumn(colIndex);
      column.values = [name, ...values];
    }

    const letter = this.sheet.getColumn(colIndex).letter;
    return `Lists!$${letter}$2:$${letter}$${values.length + 1}`;
  }
}

function requiredSuffix(col: ColumnSpec): string {
  return col.required ? " *" : "";
}

/** Adds the read-only "Trip Info" sheet: live trip context pulled from the DB, entirely locked. */
function addTripInfoSheet(workbook: ExcelJS.Workbook, spec: WorkbookSpec, context: TripContext | null): void {
  const sheet = workbook.addWorksheet("Trip Info", { properties: { tabColor: { argb: "FF1F3B4D" } } });
  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 40;

  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  const businessName = getConfig("business_name") ?? "Coral Adventures";
  title.value = `${businessName} — ${spec.title}`;
  title.font = { ...TITLE_FONT, size: 16 };

  sheet.mergeCells("A2:B2");
  const subtitle = sheet.getCell("A2");
  subtitle.value = spec.description;
  subtitle.font = { italic: true, color: { argb: "FF666666" } };
  subtitle.alignment = { wrapText: true };

  const rows: Array<[string, string]> = context
    ? [
        ["Trip ID", context.tripId],
        ["Trip Date", context.tripDate],
        ["Vessel", context.vesselName],
        ["Route", context.routeName],
        ["Cruise Type", context.cruiseTypeName],
        ["Slot", context.slot],
        ["Capacity", String(context.capacity)],
        ["Scheduled Departure", context.scheduledDeparture],
        ["Scheduled Return", context.scheduledReturn],
        ["Captain", context.captainName ?? "(unassigned)"],
      ]
    : [
        ["Trip ID", "(this is a blank example template — no trip assigned)"],
        ["Trip Date", "—"],
        ["Vessel", "—"],
        ["Route", "—"],
        ["Cruise Type", "—"],
        ["Slot", "—"],
        ["Capacity", "—"],
        ["Scheduled Departure", "—"],
        ["Scheduled Return", "—"],
        ["Captain", "—"],
      ];

  let r = 4;
  for (const [label, value] of rows) {
    const labelCell = sheet.getCell(r, 1);
    labelCell.value = label;
    labelCell.font = LABEL_FONT;
    const valueCell = sheet.getCell(r, 2);
    valueCell.value = value;
    r += 1;
  }

  const noteRow = r + 1;
  sheet.mergeCells(`A${noteRow}:B${noteRow}`);
  const note = sheet.getCell(`A${noteRow}`);
  note.value =
    "This sheet is read-only. Fields marked with * on the data sheets are required. Do not rename sheet tabs or reorder columns.";
  note.font = { italic: true, color: { argb: "FF888888" } };
  note.alignment = { wrapText: true };

  // Every cell on this sheet stays at its default locked=true — the whole
  // sheet is protected with zero unlocked cells.
}

/** Adds one data-entry sheet: locked header row + a block of unlocked input rows, with dropdowns for enum/lookup columns. */
function addDataSheet(
  workbook: ExcelJS.Workbook,
  db: Database,
  sheetSpec: SheetSpec,
  listRegistry: ListRegistry
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sheetSpec.name);
  const colOffset = sheetSpec.autoNumberColumn ? 1 : 0;

  if (sheetSpec.autoNumberColumn) {
    const headerCell = sheet.getCell(1, 1);
    headerCell.value = sheetSpec.autoNumberLabel ?? "#";
    headerCell.fill = HEADER_FILL;
    headerCell.font = HEADER_FONT;
    sheet.getColumn(1).width = 12;
  }

  sheetSpec.columns.forEach((col, idx) => {
    const c = idx + 1 + colOffset;
    const headerCell = sheet.getCell(1, c);
    headerCell.value = col.header + requiredSuffix(col);
    headerCell.fill = HEADER_FILL;
    headerCell.font = HEADER_FONT;
    headerCell.alignment = { wrapText: true, vertical: "middle" };
    sheet.getColumn(c).width = col.width ?? 18;
  });
  sheet.getRow(1).height = 30;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const numFmtFor = (col: ColumnSpec): string | undefined => {
    if (col.type === "date") return "yyyy-mm-dd";
    if (col.type === "datetime") return "yyyy-mm-dd hh:mm";
    if (col.type === "inr") return "#,##0";
    return undefined;
  };

  const validationFor = (col: ColumnSpec): ExcelJS.DataValidation | undefined => {
    if (col.type === "enum" && col.enumValues) {
      const ref = listRegistry.reference(`${sheetSpec.name}:${col.key}`, col.enumValues);
      if (!ref) return undefined;
      return { type: "list", allowBlank: !col.required, formulae: [ref], showErrorMessage: col.enumStrict !== false };
    }
    if (col.type === "lookup" && col.lookup) {
      const options = getLookupNames(db, col.lookup);
      const ref = listRegistry.reference(`${sheetSpec.name}:${col.key}`, options);
      if (!ref) return undefined;
      return { type: "list", allowBlank: !col.required, formulae: [ref], showErrorMessage: true };
    }
    if (col.type === "integer" || col.type === "booking_ref") {
      return { type: "whole", operator: "greaterThan", formulae: [0], allowBlank: !col.required };
    }
    return undefined;
  };

  for (let row = 2; row <= sheetSpec.emptyRows + 1; row += 1) {
    if (sheetSpec.autoNumberColumn) {
      const numCell = sheet.getCell(row, 1);
      numCell.value = { formula: "ROW()-1" };
      numCell.protection = { locked: true };
      numCell.font = { color: { argb: "FF888888" }, italic: true };
    }

    sheetSpec.columns.forEach((col, idx) => {
      const c = idx + 1 + colOffset;
      const cell = sheet.getCell(row, c);
      cell.protection = { locked: false };
      cell.fill = INPUT_FILL;
      const numFmt = numFmtFor(col);
      if (numFmt) cell.numFmt = numFmt;
      const validation = validationFor(col);
      if (validation) cell.dataValidation = validation;
    });
  }

  return sheet;
}

/** Builds the full workbook for a given type. `context` is null for a blank/example download (no trip assigned). */
export async function buildWorkbook(
  db: Database,
  spec: WorkbookSpec,
  context: TripContext | null
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const businessName = getConfig("business_name") ?? "Coral Adventures";
  workbook.creator = `${businessName} ERP`;
  workbook.created = new Date();

  addTripInfoSheet(workbook, spec, context);

  const listRegistry = new ListRegistry(workbook);
  for (const sheetSpec of spec.sheets) {
    addDataSheet(workbook, db, sheetSpec, listRegistry);
  }

  for (const sheet of workbook.worksheets) {
     
    await sheet.protect(SHEET_LOCK_PASSWORD, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    });
  }

  return workbook;
}
