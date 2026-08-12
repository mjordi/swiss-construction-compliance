import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CaseNoticeDraftReport } from "@/lib/case-notice-draft-report";

const NOTICE_DRAFT_FONT_FAMILY = "Noto Sans SC";
const NOTICE_DRAFT_FONTS = [
  { family: NOTICE_DRAFT_FONT_FAMILY, path: "/fonts/NotoSansSC-Variable.ttf" },
  { family: "Noto Sans Arabic", path: "/fonts/NotoSansArabic-Variable.ttf" },
  { family: "Noto Sans Hebrew", path: "/fonts/NotoSansHebrew-Variable.ttf" },
  { family: "Noto Sans Devanagari", path: "/fonts/NotoSansDevanagari-Variable.ttf" },
  { family: "Noto Sans Symbols 2", path: "/fonts/NotoSansSymbols2-Regular.ttf" },
] as const;

function fontUrl(fontPath: string) {
  return typeof window === "undefined"
    ? `http://localhost${fontPath}`
    : new URL(fontPath, window.location.origin).toString();
}

for (const font of NOTICE_DRAFT_FONTS) {
  Font.register({ family: font.family, src: fontUrl(font.path) });
}

const SCRIPT_FONTS = [
  { family: "Noto Sans Arabic", pattern: /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u },
  { family: "Noto Sans Hebrew", pattern: /[\u0590-\u05ff\ufb1d-\ufb4f]/u },
  { family: "Noto Sans Devanagari", pattern: /[\u0900-\u097f\ua8e0-\ua8ff]/u },
  { family: "Noto Sans Symbols 2", pattern: /\p{Extended_Pictographic}/u },
] as const;

function scriptFont(character: string, previousFamily: string) {
  if (/\p{Mark}|\u200d|\ufe0f|[\u{1f3fb}-\u{1f3ff}]/u.test(character)) return previousFamily;
  return SCRIPT_FONTS.find(({ pattern }) => pattern.test(character))?.family ?? NOTICE_DRAFT_FONT_FAMILY;
}

function UnicodeText({ children, style }: { children: string; style: "value" | "sourceText" }) {
  const runs: Array<{ family: string; text: string }> = [];

  for (const character of children) {
    const previousFamily = runs.at(-1)?.family ?? NOTICE_DRAFT_FONT_FAMILY;
    const family = scriptFont(character, previousFamily);
    const previousRun = runs.at(-1);
    if (previousRun?.family === family) previousRun.text += character;
    else runs.push({ family, text: character });
  }

  return (
    <Text style={styles[style]}>
      {runs.map((run, index) => (
        <Text key={`${index}-${run.family}`} style={{ fontFamily: run.family }}>{run.text}</Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 120,
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
    position: "absolute",
    top: 36,
    left: 36,
    right: 36,
    borderWidth: 1.5,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    padding: 10,
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
    { label: report.labels.draftId, value: report.draftId, wrap: false },
    { label: report.labels.createdAt, value: report.createdAt, wrap: false },
    { label: report.labels.projectName, value: report.projectName, wrap: false },
    { label: report.labels.canton, value: report.canton, wrap: false },
    { label: report.labels.regime, value: report.labels.regimes[report.regime], wrap: false },
    { label: report.labels.contractDate, value: report.contractDate, wrap: false },
    { label: report.labels.discoveryDate, value: report.discoveryDate, wrap: false },
    { label: report.labels.noticeDeadline, value: report.noticeDeadline ?? report.labels.noticeDeadlineNotFixed, wrap: false },
    { label: report.labels.recipientName, value: report.recipientName, wrap: false },
    { label: report.labels.recipientAddress, value: report.recipientAddress, wrap: true },
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
          {details.map(({ label, value, wrap }) => (
            <View key={label} style={styles.row} wrap={wrap}>
              <Text style={styles.label}>{label}</Text>
              <UnicodeText style="value">{value}</UnicodeText>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.defectStatement}</Text>
          <View style={styles.sourceBlock}>
            <Text style={styles.sourceLabel}>{report.labels.defectStatement}</Text>
            <UnicodeText style="sourceText">{report.defectStatement}</UnicodeText>
          </View>
        </View>

        <Text fixed style={styles.footer}>{report.labels.legalDisclaimer}</Text>
      </Page>
    </Document>
  );
}
