import { ImportWorkflow } from "./import-workflow";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import Trips</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-foreground-muted">
          Generate today&apos;s blank workbooks, have crew fill them in, drop the completed trip folder into{" "}
          <code className="rounded bg-surface-sunken px-1 py-0.5 text-[12px]">data/incoming/</code>, then import. If
          anything fails validation, nothing is written to the database and the original files are left untouched.
        </p>
      </div>
      <ImportWorkflow />
    </div>
  );
}
