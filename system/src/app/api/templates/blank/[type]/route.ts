import { generateBlankWorkbook } from "@/server/domain/templates";
import { WORKBOOK_ORDER, WORKBOOK_SPECS, type TemplateType } from "@/server/domain/templates/sheetSpecs";

export const dynamic = "force-dynamic";

function isTemplateType(value: string): value is TemplateType {
  return (WORKBOOK_ORDER as string[]).includes(value);
}

// GET /api/templates/blank/[type]
// Streams a standalone, blank example workbook (no trip context) — used by
// the Downloads page's "Download Blank X Workbook" buttons.
export async function GET(_request: Request, context: RouteContext<"/api/templates/blank/[type]">) {
  const { type } = await context.params;

  if (!isTemplateType(type)) {
    return Response.json(
      { error: `Unknown template type '${type}'. Expected one of: ${WORKBOOK_ORDER.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const buffer = await generateBlankWorkbook(type);
    const fileName = WORKBOOK_SPECS[type].fileName;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
