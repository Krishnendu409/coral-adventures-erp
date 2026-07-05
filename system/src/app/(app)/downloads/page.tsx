import { Database, ClipboardList, FileSpreadsheet } from "lucide-react";
import { WORKBOOK_ORDER, WORKBOOK_SPECS } from "@/server/domain/templates/sheetSpecs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, LinkButton } from "@/components/ui";
import { GenerateTodayCard } from "./generate-today-card";

export const dynamic = "force-dynamic";

export default function DownloadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Download Center</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-foreground-muted">
          Everything a manager needs to generate, print, or hand out — no folders to hunt through.
        </p>
      </div>

      <GenerateTodayCard />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Blank Workbooks</CardTitle>
            <CardDescription>
              Standalone example workbooks with no trip context — useful for training, spares, or manual filling.
            </CardDescription>
          </div>
          <FileSpreadsheet size={18} className="text-foreground-faint" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKBOOK_ORDER.map((type) => {
              const spec = WORKBOOK_SPECS[type];
              return (
                <div
                  key={type}
                  className="flex flex-col justify-between gap-3 rounded-[var(--radius-md)] border border-border-subtle p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{spec.title}</p>
                    <p className="mt-1 text-[12.5px] text-foreground-muted">{spec.description}</p>
                  </div>
                  <LinkButton href={`/api/templates/blank/${type}`} variant="secondary" size="sm">
                    Download {spec.fileName}
                  </LinkButton>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Database Backup</CardTitle>
              <CardDescription>A point-in-time copy of the live SQLite database file.</CardDescription>
            </div>
            <Database size={18} className="text-foreground-faint" />
          </CardHeader>
          <CardContent>
            <LinkButton href="/api/downloads/backup" variant="secondary">
              Download Backup
            </LinkButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Audit Report</CardTitle>
              <CardDescription>The most recent 5,000 audit log entries as a CSV file.</CardDescription>
            </div>
            <ClipboardList size={18} className="text-foreground-faint" />
          </CardHeader>
          <CardContent>
            <LinkButton href="/api/downloads/audit-report" variant="secondary">
              Download Audit Report
            </LinkButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
