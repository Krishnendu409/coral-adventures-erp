export type IssueSeverity = "warning" | "error";

export interface ValidationIssue {
  fileName: string;
  sheetName?: string;
  cellReference?: string;
  errorType: string;
  errorMessage: string;
  severity: IssueSeverity;
}

export interface TripFolderCandidate {
  tripId: string;
  folderPath: string;
  /** .xlsx file names present in the folder (not necessarily all recognized). */
  files: string[];
}

export interface ValidationResult {
  tripId: string;
  folderPath: string;
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ImportResult {
  tripId: string;
  folderPath: string;
  batchId: string;
  status: "committed" | "failed";
  issues: ValidationIssue[];
  archivedFiles?: string[];
}
