import fs from "node:fs";
import path from "node:path";
import { DB_FILE, PATHS } from "@/server/config/paths";

export const dynamic = "force-dynamic";

// GET /api/downloads/backup
// Copies the live SQLite database file to data/backups/ with a timestamped
// name, then streams that copy back as a download. The copy-then-stream
// (rather than streaming DB_FILE directly) also leaves a durable backup on
// disk for disaster recovery, matching CLAUDE.md's "Backups" folder purpose.
export async function GET() {
  try {
    fs.mkdirSync(PATHS.backups, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `coral_adventures_${timestamp}.sqlite3`;
    const destPath = path.join(PATHS.backups, fileName);

    fs.copyFileSync(DB_FILE, destPath);
    const buffer = fs.readFileSync(destPath);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
