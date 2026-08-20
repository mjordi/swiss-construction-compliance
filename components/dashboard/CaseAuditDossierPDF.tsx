import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CaseAuditDossierReport } from "@/lib/case-audit-dossier";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#d97706",
    paddingBottom: 10,
  },
  title: { fontSize: 21, fontWeight: "bold" },
  brand: { marginTop: 4, color: "#d97706", fontSize: 10 },
  generated: { marginTop: 5, color: "#64748b", fontSize: 8 },
  section: { marginTop: 14 },
  sectionTitle: {
    marginBottom: 7,
    color: "#334155",
    fontSize: 12,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  label: { width: "34%", color: "#475569", fontWeight: "bold" },
  value: { width: "66%" },
  readiness: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    padding: 8,
  },
  readinessScore: { marginBottom: 6, fontSize: 11, fontWeight: "bold" },
  listLabel: { marginTop: 5, marginBottom: 2, color: "#475569", fontWeight: "bold" },
  listItem: { marginBottom: 2, paddingLeft: 6 },
  milestone: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  milestoneContext: { width: "68%" },
  milestoneDate: { width: "32%", textAlign: "right" },
  source: { marginTop: 2, color: "#64748b", fontSize: 7 },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 7,
    color: "#64748b",
    fontSize: 7,
    textAlign: "center",
  },
});

export function CaseAuditDossierPDF({ report }: { report: CaseAuditDossierReport }) {
  const details = [
    [report.labels.caseId, report.caseId],
    [report.labels.projectName, report.projectName],
    [report.labels.canton, report.canton],
    [report.labels.regime, report.regime],
    [report.labels.status, report.status],
    [report.labels.contractDate, report.contractDate],
    [report.labels.discoveryDate, report.discoveryDate],
    [report.labels.noticeDeadline, report.noticeDeadline],
    [report.labels.nextAction, report.nextAction],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.brand}>BauCompliance.ch</Text>
          <Text style={styles.generated}>
            {report.generatedAtLabel}: {report.generatedAt}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.projectName}</Text>
          {details.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.checklist}</Text>
          <View style={styles.readiness}>
            <Text style={styles.readinessScore}>
              {report.readiness.completed}/{report.readiness.total}
            </Text>
            <Text style={styles.listLabel}>{report.labels.checklistReady}</Text>
            {report.readiness.ready.map((item) => (
              <Text key={`ready-${item}`} style={styles.listItem}>• {item}</Text>
            ))}
            <Text style={styles.listLabel}>{report.labels.checklistMissing}</Text>
            {report.readiness.missing.length > 0 ? report.readiness.missing.map((item) => (
              <Text key={`missing-${item}`} style={styles.listItem}>• {item}</Text>
            )) : <Text style={styles.listItem}>—</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{report.labels.chronology}</Text>
          <Text style={styles.generated}>
            {report.labels.linkedProtocols}: {report.linkedProtocolsSummary}
          </Text>
          {report.milestones.map((milestone, index) => (
            <View key={`${milestone.kind}-${milestone.sourceId ?? index}`} style={styles.milestone}>
              <View style={styles.milestoneContext}>
                <Text>{milestone.label}</Text>
                {milestone.sourceId ? <Text style={styles.source}>{milestone.sourceId}</Text> : null}
                {milestone.sourceName ? <Text style={styles.source}>{milestone.sourceName}</Text> : null}
                {milestone.supportingEvidenceName ? (
                  <Text style={styles.source}>
                    {report.labels.supportingEvidence ?? "User-linked supporting evidence"}: {milestone.supportingEvidenceName}
                  </Text>
                ) : null}
                {milestone.supportingEvidenceId ? (
                  <Text style={styles.source}>
                    {report.labels.supportingEvidenceId ?? "Evidence ID"}: {milestone.supportingEvidenceId}
                  </Text>
                ) : null}
                {milestone.supportingEvidenceAssociationId ? (
                  <Text style={styles.source}>
                    {report.labels.supportingEvidenceAssociationId ?? "Association ID"}: {milestone.supportingEvidenceAssociationId}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.milestoneDate}>{milestone.dateLabel}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>{report.legalDisclaimer}</Text>
      </Page>
    </Document>
  );
}
