import { scanIncoming } from "@/server/domain/import/importEngine";

export const dynamic = "force-dynamic";

// POST /api/import/scan
// Read-only: lists trip folders currently waiting under data/incoming/
// without importing or modifying anything.
export async function POST() {
  try {
    const candidates = scanIncoming();
    return Response.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
