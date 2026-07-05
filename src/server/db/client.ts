import Database from "better-sqlite3";
import fs from "node:fs";
import { DB_FILE, PATHS } from "../config/paths";

declare global {
  // eslint-disable-next-line no-var
  var __coralDb: Database.Database | undefined;
}

function openDatabase(): Database.Database {
  fs.mkdirSync(PATHS.database, { recursive: true });

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  return db;
}

// Cached on globalThis so Next.js dev-mode hot-reload (which re-evaluates
// modules but keeps the process alive) doesn't open a second connection to
// the same WAL-mode file.
export function getDb(): Database.Database {
  if (!global.__coralDb) {
    global.__coralDb = openDatabase();
  }
  return global.__coralDb;
}
