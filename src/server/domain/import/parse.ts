import ExcelJS from "exceljs";
type Database = any;
import type { ColumnSpec, SheetSpec, WorkbookSpec } from "../templates/sheetSpecs";
import { resolveLookupId } from "../templates/tripContext";
import type { ValidationIssue } from "./types";

export type CellTypedValue = string | number | Date | null;

export interface ParsedRow {
  /** 1-based data row index (row 1 = first row under the header), matching the "Booking #" style cross-sheet references. */
  rowNumber: number;
  values: Record<string, CellTypedValue>;
  /** Resolved DB ids for "lookup" columns, keyed by column key. */
  lookupIds: Record<string, string | null>;
}

export interface ParsedSheet {
  spec: SheetSpec;
  rows: ParsedRow[];
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: Record<string, ParsedSheet>;
}

interface CoerceResult {
  value: CellTypedValue;
  error?: string;
}

function coerceCell(raw: unknown, col: ColumnSpec): CoerceResult {
  const isBlank = raw === null || raw === undefined || raw === "";
  if (isBlank) {
    return { value: col.default !== undefined ? (col.default as CellTypedValue) : null };
  }

  switch (col.type) {
    case "text":
      return { value: String(raw).trim() };

    case "lookup":
      return { value: String(raw).trim() };

    case "enum": {
      const str = String(raw).trim();
      const match = col.enumValues?.find((v) => v.toLowerCase() === str.toLowerCase());
      if (!match) {
        if (col.enumStrict === false) {
          // Free-text CHECK-unconstrained column (e.g. weather condition) — accept as-is.
          return { value: str };
        }
        return { value: null, error: `must be one of: ${col.enumValues?.join(", ")}` };
      }
      return { value: match };
    }

    case "integer":
    case "booking_ref": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { value: null, error: "must be a whole number" };
      }
      return { value: n };
    }

    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return { value: null, error: "must be a number" };
      return { value: n };
    }

    case "inr": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return { value: null, error: "must be a number" };
      if (!Number.isInteger(n)) return { value: null, error: "must be a whole number of rupees (no paise)" };
      return { value: n };
    }

    case "date":
    case "datetime": {
      if (raw instanceof Date) return { value: raw };
      const d = new Date(raw as string | number);
      if (Number.isNaN(d.getTime())) return { value: null, error: "must be a valid date" };
      return { value: d };
    }

    default:
      return { value: String(raw).trim() };
  }
}

/**
 * Reads and validates one workbook file against its spec. DB-dependent
 * validation (lookup resolution) is folded in here since it's cheap and
 * keeps validate.ts focused on cross-file/business-rule checks. Pushes any
 * problems onto the shared `issues` array; never throws for data problems
 * (only for a genuinely unreadable/corrupt file, which is itself reported as
 * an issue, returning null).
 */
export async function parseWorkbookFile(
  filePath: string,
  fileName: string,
  spec: WorkbookSpec,
  db: Database,
  issues: ValidationIssue[]
): Promise<ParsedWorkbook | null> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    issues.push({
      fileName,
      errorType: "corrupt_file",
      errorMessage: `Could not open workbook: ${(err as Error).message}`,
      severity: "error",
    });
    return null;
  }

  const sheets: Record<string, ParsedSheet> = {};

  for (const sheetSpec of spec.sheets) {
    const ws = workbook.getWorksheet(sheetSpec.name);
    if (!ws) {
      issues.push({
        fileName,
        sheetName: sheetSpec.name,
        errorType: "missing_sheet",
        errorMessage: `Expected sheet '${sheetSpec.name}' was not found in this workbook`,
        severity: "error",
      });
      continue;
    }

    const colOffset = sheetSpec.autoNumberColumn ? 1 : 0;
    const rows: ParsedRow[] = [];
    const lastRow = ws.actualRowCount;

    for (let r = 2; r <= lastRow; r += 1) {
      const excelRow = ws.getRow(r);

      const rawByKey: Record<string, unknown> = {};
      const addressByKey: Record<string, string> = {};
      let anyValue = false;
      sheetSpec.columns.forEach((col, idx) => {
        const cell = excelRow.getCell(colOffset + idx + 1);
        rawByKey[col.key] = cell.value;
        addressByKey[col.key] = cell.address;
        if (cell.value !== null && cell.value !== undefined && cell.value !== "") anyValue = true;
      });
      if (!anyValue) continue; // skip fully-blank rows

      const rowNumber = r - 1;
      const values: Record<string, CellTypedValue> = {};
      const lookupIds: Record<string, string | null> = {};

      for (const col of sheetSpec.columns) {
        const cellRef = `${sheetSpec.name}!${addressByKey[col.key]}`;
        const { value, error } = coerceCell(rawByKey[col.key], col);

        if (error) {
          issues.push({
            fileName,
            sheetName: sheetSpec.name,
            cellReference: cellRef,
            errorType: "type_error",
            errorMessage: `${col.header}: ${error}`,
            severity: "error",
          });
          values[col.key] = null;
          continue;
        }

        if (value === null && col.required) {
          issues.push({
            fileName,
            sheetName: sheetSpec.name,
            cellReference: cellRef,
            errorType: "required_field",
            errorMessage: `${col.header} is required`,
            severity: "error",
          });
        }

        values[col.key] = value;

        if (col.type === "lookup" && col.lookup) {
          if (typeof value === "string" && value.length > 0) {
            const id = resolveLookupId(db, col.lookup, value);
            if (!id) {
              issues.push({
                fileName,
                sheetName: sheetSpec.name,
                cellReference: cellRef,
                errorType: "lookup_not_found",
                errorMessage: `${col.header}: '${value}' was not found in ${col.lookup}`,
                severity: "error",
              });
            }
            lookupIds[col.key] = id;
          } else {
            lookupIds[col.key] = null;
          }
        }
      }

      rows.push({ rowNumber, values, lookupIds });
    }

    if (sheetSpec.singleRow && rows.length !== 1) {
      issues.push({
        fileName,
        sheetName: sheetSpec.name,
        errorType: "row_count",
        errorMessage: `Expected exactly 1 data row in '${sheetSpec.name}', found ${rows.length}`,
        severity: "error",
      });
    }

    sheets[sheetSpec.name] = { spec: sheetSpec, rows };
  }

  return { fileName, sheets };
}
