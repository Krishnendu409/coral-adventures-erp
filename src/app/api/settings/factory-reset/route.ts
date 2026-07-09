import { productionWipe } from "../../../../server/db/production-wipe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    productionWipe();
    return Response.json({ success: true, message: "Production wipe successful. All operational facts deleted." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
