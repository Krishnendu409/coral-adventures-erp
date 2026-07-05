import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client";

const SCHEMA_DIR = path.join(__dirname, "schema");

/**
 * Applies every .sql file in db/schema/, in filename order, exactly once.
 * Safe to call on every app startup (start.bat does): already-applied files
 * are skipped via schema_migrations, and each file's own DDL is idempotent
 * (CREATE TABLE/INDEX IF NOT EXISTS) as a second line of defense.
 */
export function migrate(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT filename FROM schema_migrations")
      .all()
      .map((row) => (row as { filename: string }).filename)
  );

  const files = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
    });
    applyMigration();
    console.log(`[migrate] applied ${file}`);
  }
}

if (require.main === module) {
  migrate();
  console.log("[migrate] schema up to date.");
}
