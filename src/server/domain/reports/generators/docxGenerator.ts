import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType, HeadingLevel, AlignmentType, ImageRun, ShadingType } from "docx";
import { ExecutiveReportData } from "../executiveData";
import { getConfig } from "../../settings/configRepository";

export async function generateDocx(data: ExecutiveReportData): Promise<Buffer> {
  const chartConfig = {
    type: 'bar',
    data: {
      labels: data.revenueByDate.map(d => d.date),
      datasets: [{
        label: 'Revenue (INR)',
        data: data.revenueByDate.map(d => d.revenue),
        backgroundColor: '#0ea5e9',
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  };
  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=200&bkg=white`;
  
  let imageBuffer: Buffer;
  try {
    const imageResp = await fetch(chartUrl);
    imageBuffer = Buffer.from(await imageResp.arrayBuffer());
  } catch (err) {
    console.error("Failed to fetch chart image:", err);
    // fallback 1x1 white pixel if fetch fails
    imageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Branding Header
          new Paragraph({
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.CLEAR, fill: "0EA5E9" },
            spacing: { before: 400, after: 400 },
            children: [
              new TextRun({ text: ` ${getConfig("business_name") ?? "Coral Adventures"} `, size: 56, bold: true, color: "FFFFFF" }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 400 },
            children: [
              new TextRun({ text: `Executive Report • ${data.timeframe}`, size: 28, color: "0EA5E9" })
            ]
          }),

          // KPIs
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Key Performance Indicators", color: "1E293B" })],
            spacing: { before: 400, after: 200 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              insideHorizontal: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: "F8FAFC" },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "TOTAL REVENUE", size: 20, color: "64748B" })] }),
                      new Paragraph({ children: [new TextRun({ text: `Rs ${data.totalRevenue.toLocaleString()}`, size: 36, bold: true, color: "0F172A" })] })
                    ]
                  }),
                  new TableCell({
                    shading: { fill: "F8FAFC" },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "TOTAL TRIPS", size: 20, color: "64748B" })] }),
                      new Paragraph({ children: [new TextRun({ text: `${data.totalTrips}`, size: 36, bold: true, color: "0F172A" })] })
                    ]
                  }),
                  new TableCell({
                    shading: { fill: "F8FAFC" },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "AVG NPS", size: 20, color: "64748B" })] }),
                      new Paragraph({ children: [new TextRun({ text: `${data.averageNps}`, size: 36, bold: true, color: "0F172A" })] })
                    ]
                  })
                ]
              })
            ]
          }),

          // Chart
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Revenue Trend", color: "1E293B" })],
            spacing: { before: 600, after: 200 }
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: "png",
                data: imageBuffer,
                transformation: { width: 600, height: 200 }
              })
            ]
          }),

          // Table
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Recent Trips Breakdown", color: "1E293B" })],
            spacing: { before: 600, after: 200 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
            },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Trip ID", bold: true })] })] }),
                  new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Vessel", bold: true })] })] }),
                  new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })] }),
                  new TableCell({ shading: { fill: "F1F5F9" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Revenue", bold: true })] })] }),
                ]
              }),
              ...data.trips.slice(0, 15).map(t => new TableRow({
                children: [
                  new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph(t.id.slice(0, 8))] }),
                  new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph(t.vessel_id)] }),
                  new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph(t.departure_time.slice(0, 10))] }),
                  new TableCell({ margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph(`Rs ${t.revenue_inr.toLocaleString()}`)] }),
                ]
              }))
            ]
          })
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
