import { NextRequest } from "next/server";
import { getExecutiveData } from "@/server/domain/reports/executiveData";
import { generateCsv } from "@/server/domain/reports/generators/csvGenerator";
import { generateDocx } from "@/server/domain/reports/generators/docxGenerator";
import { generatePdfStream } from "@/server/domain/reports/generators/pdfGenerator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    
    // In a real app we'd parse startDate and endDate from query. 
    // Defaulting to 1 year ago -> now for demonstration.
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    const startDate = url.searchParams.get("startDate") || oneYearAgo.toISOString();
    const endDate = url.searchParams.get("endDate") || now.toISOString();
    const label = url.searchParams.get("label") || "Year to Date";

    const data = getExecutiveData(startDate, endDate, label);
    const dateStr = now.toISOString().slice(0, 10);

    if (format === "pdf") {
      const pdfStream = await generatePdfStream(data);
      return new Response(pdfStream as any, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="executive-report-${dateStr}.pdf"`
        }
      });
    }

    if (format === "docx") {
      const buffer = await generateDocx(data);
      return new Response(buffer as any, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="executive-report-${dateStr}.docx"`
        }
      });
    }

    // Default to CSV
    const buffer = generateCsv(data);
    return new Response(buffer as any, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="executive-report-${dateStr}.csv"`
      }
    });

  } catch (err) {
    console.error("Report generation failed:", err);
    return Response.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
