import { getDb } from "./system/src/server/db/client";
import { getFinancialSummary } from "./system/src/server/domain/analytics/financial";
import { getBusinessParameters } from "./system/src/server/domain/settings/actions";
import { performance } from "perf_hooks";

async function main() {
  const db = getDb();
  console.log("DB connected");

  let start = performance.now();
  await getBusinessParameters();
  console.log(`getBusinessParameters took ${performance.now() - start}ms`);

  start = performance.now();
  const summary = getFinancialSummary(undefined, { from: "2026-01-01", to: "2026-07-05" });
  console.log(`getFinancialSummary took ${performance.now() - start}ms`);
}

main().catch(console.error);
