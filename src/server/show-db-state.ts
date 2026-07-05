import { getDb } from "./db/client";

const db = getDb();

// Get a list of all tables
const tables = db.prepare(`
  SELECT name 
  FROM sqlite_schema 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all() as { name: string }[];

console.log("=== DATABASE STATE ===");

for (const table of tables) {
  const count = (db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as any).count;
  console.log(`\nTable: [${table.name}] -> ${count} rows`);
  
  if (count > 0) {
    // If the table has data, let's show up to 2 rows to give a sense of what's inside
    const rows = db.prepare(`SELECT * FROM ${table.name} LIMIT 2`).all();
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log("(Empty)");
  }
}
