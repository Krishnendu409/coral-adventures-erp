import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

interface ConfigRow {
  config_key: string;
  config_value: string;
}

// GET /api/settings — returns every app_config row as a flat {key: value} object.
export async function GET() {
  const db = getDb();
  const rows = db.prepare(`SELECT config_key, config_value FROM app_config`).all() as ConfigRow[];
  const config: Record<string, string> = {};
  for (const r of rows) config[r.config_key] = r.config_value;
  return Response.json(config);
}

// POST /api/settings — body { key: string, value: string }, upserts a single setting.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = body ?? {};
    if (typeof key !== "string" || !key.trim()) {
      return Response.json({ error: "A setting 'key' is required." }, { status: 400 });
    }
    if (typeof value !== "string") {
      return Response.json({ error: "A string 'value' is required." }, { status: 400 });
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO app_config (config_key, config_value, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at`
    ).run(key, value);

    return Response.json({ ok: true, key, value });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
