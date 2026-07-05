import { getDb } from "./src/server/db/client";
import { getFinancialSummary } from "./src/server/domain/analytics/financial";
import { performance } from "perf_hooks";

async function main() {
  const db = getDb();
  console.log("DB connected");

  let start = performance.now();
  const summary1 = getFinancialSummary(undefined, { from: "2026-06-01", to: "2026-07-05" });
  console.log(`getFinancialSummary Month took ${performance.now() - start}ms`);

  start = performance.now();
  const summary2 = getFinancialSummary(undefined, { from: "2026-04-01", to: "2026-07-05" });
  console.log(`getFinancialSummary Quarter took ${performance.now() - start}ms`);

  start = performance.now();
  const summary3 = getFinancialSummary(undefined, { from: "2026-01-01", to: "2026-07-05" });
  console.log(`getFinancialSummary Year took ${performance.now() - start}ms`);
}

main().catch(console.error);
