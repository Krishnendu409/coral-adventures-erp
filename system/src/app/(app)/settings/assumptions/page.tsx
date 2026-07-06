import { getBusinessParameters } from "@/server/domain/settings/actions";
import { AssumptionsClient } from "./AssumptionsClient";

export const dynamic = "force-dynamic";

export default async function AssumptionsPage() {
  const parameters = await getBusinessParameters();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Assumptions</h1>
        <p className="mt-1 text-[13px] text-foreground-muted">
          Configure the base parameters, constants, and assumptions used across all intelligence models.
        </p>
      </div>
      
      <AssumptionsClient initialParameters={parameters} />
    </div>
  );
}
