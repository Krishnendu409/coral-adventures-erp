import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToStream, Image } from "@react-pdf/renderer";
import { ExecutiveReportData } from "../executiveData";
import { getConfig } from "../../settings/configRepository";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 0,
    fontFamily: "Helvetica"
  },
  brandHeader: {
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    padding: 40,
    paddingBottom: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end"
  },
  titleBlock: {
    flex: 1
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#ffffff"
  },
  brandSubtitle: {
    fontSize: 14,
    color: "#e0f2fe"
  },
  logoBlock: {
    alignItems: "flex-end"
  },
  dateText: {
    fontSize: 10,
    color: "#bae6fd"
  },
  content: {
    padding: 40,
  },
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 20,
    marginRight: 15,
    borderRadius: 8,
    borderLeft: "4px solid #f97316"
  },
  kpiBoxLast: {
    marginRight: 0
  },
  kpiLabel: {
    fontSize: 10,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 8
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a"
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#1e293b",
    marginTop: 10
  },
  chartContainer: {
    marginBottom: 30,
    padding: 20,
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8
  },
  chart: {
    width: "100%",
    height: 200
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 4
  },
  tableRow: {
    margin: "auto",
    flexDirection: "row"
  },
  tableCol: {
    width: "25%",
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0
  },
  tableHeader: {
    backgroundColor: "#f1f5f9",
    fontWeight: "bold"
  },
  tableCell: {
    margin: 8,
    fontSize: 10,
    color: "#334155"
  }
});

const ReportDocument = ({ data }: { data: ExecutiveReportData }) => {
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandHeader}>
          <View style={styles.titleBlock}>
            <Text style={styles.brandTitle}>{getConfig("business_name") ?? "Coral Adventures"}</Text>
            <Text style={styles.brandSubtitle}>Executive Report • {data.timeframe}</Text>
          </View>
          <View style={styles.logoBlock}>
            <Text style={styles.dateText}>Generated: {new Date().toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Total Revenue</Text>
              <Text style={styles.kpiValue}>Rs {data.totalRevenue.toLocaleString()}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Total Trips</Text>
              <Text style={styles.kpiValue}>{data.totalTrips}</Text>
            </View>
            <View style={[styles.kpiBox, styles.kpiBoxLast]}>
              <Text style={styles.kpiLabel}>Avg NPS</Text>
              <Text style={styles.kpiValue}>{data.averageNps}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Revenue Trend</Text>
          <View style={styles.chartContainer}>
            <Image src={chartUrl} style={styles.chart} />
          </View>

          <Text style={styles.sectionTitle}>Recent Trips</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Trip ID</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Vessel</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Date</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>Revenue</Text></View>
            </View>
            {data.trips.slice(0, 10).map((t, i) => (
              <View style={styles.tableRow} key={i}>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{t.id.slice(0,8)}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{t.vessel_id}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>{t.departure_time.slice(0,10)}</Text></View>
                <View style={styles.tableCol}><Text style={styles.tableCell}>Rs {t.revenue_inr.toLocaleString()}</Text></View>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
};

export async function generatePdfStream(data: ExecutiveReportData) {
  return await renderToStream(<ReportDocument data={data} />);
}
