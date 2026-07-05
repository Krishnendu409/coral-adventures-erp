import path from "node:path";

// DATA_ROOT defaults to ./data relative to the webapp, but can be overridden by env vars
export const BUSINESS_ROOT = process.cwd();
export const DATA_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(BUSINESS_ROOT, "data");

export const PATHS = {
  incoming: path.join(DATA_ROOT, "incoming"),
  generated: path.join(DATA_ROOT, "generated"),
  archive: path.join(DATA_ROOT, "archive"),
  reports: path.join(DATA_ROOT, "reports"),
  exports: path.join(DATA_ROOT, "exports"),
  logs: path.join(DATA_ROOT, "logs"),
  backups: path.join(DATA_ROOT, "backups"),
  templates: path.join(DATA_ROOT, "templates"),
  database: path.join(DATA_ROOT, "database"),
  configuration: path.join(DATA_ROOT, "configuration"),
} as const;

export const DB_FILE = path.join(PATHS.database, "coral_adventures.sqlite3");

export const DOCS_BUSINESS_DIR = path.join(BUSINESS_ROOT, "docs", "superpowers");
