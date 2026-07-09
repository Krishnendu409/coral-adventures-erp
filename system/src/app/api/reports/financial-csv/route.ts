import type { NextRequest } from "next/server";
import { getFinancialSummary } from "@/server/domain/analytics/financial";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number): string {
  const v = String(value);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function csvRow(...cells: Array<string | number>): string {
  return cells.map(csvEscape).join(",");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// GET /api/reports/financial-csv?from=YYYY-MM-DD&to=YYYY-MM-DD&label=This%20Month
// Streams a CSV export of the Financial Summary (revenue by payment type,
// expenses by category, profit and margins) for the given date range.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const label = request.nextUrl.searchParams.get("label") ?? "Custom Range";

  if (!from || !to) {
    return Response.json({ error: "Both 'from' and 'to' query parameters (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const summary = getFinancialSummary(undefined, { from, to });

  const lines: string[] = [];
  lines.push(csvRow("Financial Summary", label));
  lines.push(csvRow("Period", `${from} to ${to}`));
  lines.push("");

  lines.push(csvRow("Revenue by Payment Type"));
  lines.push(csvRow("payment_type", "amount_inr"));
  for (const [type, amount] of Object.entries(summary.revenue.byPaymentType)) {
    lines.push(csvRow(type, amount));
  }
  lines.push(csvRow("Total Revenue", summary.revenue.totalInr));
  lines.push("");

  lines.push(csvRow("Expenses by Category"));
  lines.push(csvRow("category", "amount_inr"));
  for (const [category, amount] of Object.entries(summary.expenses.byCategory)) {
    lines.push(csvRow(category, amount));
  }
  lines.push(csvRow("Total Expenses", summary.expenses.totalInr));
  lines.push("");

  lines.push(csvRow("Profit", summary.profitInr));
  lines.push(csvRow("Gross Margin %", summary.grossMarginPct ?? ""));
  lines.push(csvRow("Net Margin %", summary.netMarginPct ?? ""));
  lines.push(csvRow("Contribution Margin %", summary.contributionMarginPct ?? ""));

  const csv = lines.join("\n") + "\n";
  const fileName = `financial-summary-${slug(label)}-${from}_to_${to}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
