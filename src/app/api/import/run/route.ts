import { importAllIncoming } from "@/server/domain/import/importEngine";

export const dynamic = "force-dynamic";

// POST /api/import/run
// Imports every trip folder currently waiting in data/incoming/, one at a
// time. A validation or transaction failure in one folder never affects
// another; each folder's result (committed/failed + issues) is reported.
export async function POST() {
  try {
    const results = await importAllIncoming();
    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
