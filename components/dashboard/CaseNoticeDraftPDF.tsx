import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CaseNoticeDraftReport } from "@/lib/case-notice-draft-report";

const NOTICE_DRAFT_FONT_FAMILY = "Noto Sans SC";
const NOTICE_DRAFT_FONT_PATH = "/fonts/NotoSansSC-Variable.ttf";
const NOTICE_DRAFT_FONT_URL = typeof window === "undefined"
  ? `http://localhost${NOTICE_DRAFT_FONT_PATH}`
  : new URL(NOTICE_DRAFT_FONT_PATH, window.location.origin).toString();

Font.register({
  family: NOTICE_DRAFT_FONT_FAMILY,
  src: NOTICE_DRAFT_FONT_URL,
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 54,
    paddingHorizontal: 36,
    backgroundColor: "#ffffff",
    color: "#172033",
    fontFamily: NOTICE_DRAFT_FONT_FAMILY,
    fontSize: 9,
    lineHeight: 1.45,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#0891b2",
    paddingBottom: 10,
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: "bold" },
  brand: { marginTop: 3, color: "#0e7490", fontSize: 9 },
  statusBox: {
    borderWidth: 1.5,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    padding: 10,
    marginBottom: 14,
  },
  status: { color: "#92400e", fontSize: 13, fontWeight: "bold", textAlign: "center" },
  review: { marginTop: 6, color: "#78350f", textAlign: "center" },
  section: { marginTop: 12 },
  sectionTitle: { marginBottom: 6, color: "#155e75", fontSize: 11, fontWeight: "bold" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  label: { width: "32%", color: "#475569", fontWeight: "bold", paddingRight: 8 },
  value: { width: "68%" },
  sourceBlock: {
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 9,
  },
  sourceLabel: { color: "#475569", fontWeight: "bold", marginBottom: 4 },
  sourceText: { fontSize: 9.5 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    color: "#64748b",
    fontSize: 7,
    textAlign: "center",
  },
});

export function CaseNoticeDraftPDF({ report }: { report: CaseNoticeDraftReport }) {
  const details = [
    [report.labels.draftId, report.draftId],
    [report.labels.createdAt, report.createdAt],
    [report.labels.projectName, report.projectName],
    [report.labels.canton, report.canton],
    [report.labels.regime, report.labels.regimes[report.regime]],
    [report.labels.contractDate, report.contractDate],
    [report.labels.discoveryDate, report.discoveryDate],
    [report.labels.noticeDeadline, report.noticeDeadline ?? report.labels.noticeDeadlineNotFixed],
    [report.labels.recipientName, report.recipientName],
    [report.labels.recipientAddress, report.recipientAddress],
  ];

  return (
    <Document>
      <Page size="A4" wrap style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{report.labels.title}</Text>
          <Text style={styles.brand}>BauCompliance.ch</Text>
        </View>

        <View fixed style={styles.statusBox} wrap={false}>
          <Text style={styles.status}>
            {report.labels.saved} · {report.labels.notApproved} · {report.labels.notSent}
          </Text>
          <Text style={styles.review}>{report.labels.reviewDisclaimer}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.projectName}</Text>
          {details.map(([label, value]) => (
            <View key={label} style={styles.row} wrap={false}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.defectStatement}</Text>
          <View style={styles.sourceBlock}>
            <Text style={styles.sourceLabel}>{report.labels.defectStatement}</Text>
            <Text style={styles.sourceText}>{report.defectStatement}</Text>
          </View>
        </View>

        <Text fixed style={styles.footer}>{report.labels.legalDisclaimer}</Text>
      </Page>
    </Document>
  );
}
