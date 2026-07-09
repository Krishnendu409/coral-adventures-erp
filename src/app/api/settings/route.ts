import { getAllConfigs, setConfig } from "../../../server/domain/settings/configRepository";

export const dynamic = "force-dynamic";

// GET /api/settings — returns every app_config row as a flat {key: value} object.
export async function GET() {
  try {
    const config = getAllConfigs();
    return Response.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
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

    setConfig(key, value);

    return Response.json({ ok: true, key, value });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
