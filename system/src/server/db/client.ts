// @ts-ignore
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { DB_FILE, PATHS } from "../config/paths";

class BetterSqlite3Polyfill {
  private db: any;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }

  pragma(str: string) {
    this.db.exec(`PRAGMA ${str}`);
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...args: any[]) => stmt.run(...args),
      get: (...args: any[]) => {
        const res = stmt.get(...args);
        return res ? JSON.parse(JSON.stringify(res)) : res;
      },
      all: (...args: any[]) => {
        const res = stmt.all(...args);
        return res ? JSON.parse(JSON.stringify(res)) : res;
      },
    };
  }
  
  exec(sql: string) {
    this.db.exec(sql);
  }

  transaction(cb: Function) {
    return (...args: any[]) => {
      this.db.exec("BEGIN");
      try {
        const result = cb(...args);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    };
  }
}

declare global {
   
  var __coralDb: BetterSqlite3Polyfill | undefined;
}

function openDatabase(): BetterSqlite3Polyfill {
  fs.mkdirSync(PATHS.database, { recursive: true });

  const db = new BetterSqlite3Polyfill(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  return db;
}

// Cached on globalThis so Next.js dev-mode hot-reload (which re-evaluates
// modules but keeps the process alive) doesn't open a second connection to
// the same WAL-mode file.
export function getDb(): BetterSqlite3Polyfill {
  if (!global.__coralDb) {
    global.__coralDb = openDatabase();
  }
  return global.__coralDb;
}
