import { generateTodaysTripPackage } from "@/server/domain/templates";

export const dynamic = "force-dynamic";

// POST /api/templates/generate-today
// Ensures today's trip-slot rows exist and generates the 7-workbook package
// for each, writing files under data/generated/<yyyy>/<mm>/<dd>/<tripId>/.
export async function POST() {
  try {
    const result = await generateTodaysTripPackage();
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
