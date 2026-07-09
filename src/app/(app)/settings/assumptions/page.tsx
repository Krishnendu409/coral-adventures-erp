import { getBusinessParameters } from "@/server/domain/settings/actions";
import { AssumptionsClient } from "./AssumptionsClient";

export const dynamic = "force-dynamic";

export default async function AssumptionsPage() {
  const parameters = await getBusinessParameters();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Assumptions</h1>
          <p className="mt-1 text-[13px] text-foreground-muted">
            Configure the base parameters, constants, and assumptions used across all intelligence models.
          </p>
        </div>
        <div>
          <a
            href="/dashboard/settings"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken/80"
          >
            System Config & Reset
          </a>
        </div>
      </div>
      
      <AssumptionsClient initialParameters={parameters} />
    </div>
  );
}
