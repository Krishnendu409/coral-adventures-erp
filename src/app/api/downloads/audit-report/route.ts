import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

interface AuditRow {
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by_user_id: string | null;
  changed_at: string;
}

function csvEscape(value: string | null): string {
  const v = value ?? "";
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// GET /api/downloads/audit-report
// Streams the most recent 5,000 audit_log rows as CSV, newest first.
export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT entity_type, entity_id, action, changed_by_user_id, changed_at
         FROM audit_log ORDER BY changed_at DESC, audit_id DESC LIMIT 5000`
      )
      .all() as AuditRow[];

    const header = "entity_type,entity_id,action,changed_by_user_id,changed_at";
    const lines = rows.map((r) =>
      [
        csvEscape(r.entity_type),
        csvEscape(r.entity_id),
        csvEscape(r.action),
        csvEscape(r.changed_by_user_id),
        csvEscape(r.changed_at),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n") + "\n";

    const fileName = `audit-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
