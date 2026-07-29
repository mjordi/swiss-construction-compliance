import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { FinalizedProtocolReport } from '@/lib/protocol-report';

// Register a standard font
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfA.ttf' }, // Standard font fallback
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f97316', // Accent orange
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a', // Slate 900
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b', // Slate 500
    marginTop: 4,
  },
  brand: {
    fontSize: 12,
    color: '#f97316',
    fontWeight: 'bold',
  },
  section: {
    margin: 10,
    padding: 10,
  },

  item: {
    flexDirection: 'row',
    marginBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    width: '40%',
  },
  statusValue: {
    fontSize: 10,
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '4 8',
    borderRadius: 4,
  },
  detailValue: {
    fontSize: 12,
    width: '60%',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    textAlign: 'center',
    color: '#94a3b8',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
});

interface AuditReportProps {
  fileName: string;
  caseId?: string;
  contractor?: string;
  client?: string;
  report: FinalizedProtocolReport;
}

function getFinalizationDate(report: FinalizedProtocolReport): string {
  return new Date(report.finalizedAt).toLocaleDateString('de-CH', {
    timeZone: 'Europe/Zurich',
  });
}

function getDefectEvidenceText(report: FinalizedProtocolReport): string {
  switch (report.defectEvidence.kind) {
    case 'documented':
      return report.defectEvidence.description;
    case 'none-visible-confirmed':
      return 'No visible defects confirmed';
    case 'not-recorded':
      return 'No defect statement recorded';
  }
}

export const AuditReportPDF = ({ fileName, caseId, contractor, client, report }: AuditReportProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Finalized Protocol Record</Text>
          <Text style={styles.subtitle}>Source-bound record of captured protocol information</Text>
        </View>
        <Text style={styles.brand}>BauCompliance.ch</Text>
      </View>

      <View style={styles.section}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 15, color: '#334155' }}>Protocol Details</Text>
        
        <View style={styles.item}>
          <Text style={styles.itemTitle}>File Name</Text>
          <Text style={styles.detailValue}>{fileName}</Text>
        </View>
        
        <View style={styles.item}>
          <Text style={styles.itemTitle}>Finalization Date</Text>
          <Text style={styles.detailValue}>{getFinalizationDate(report)}</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Protocol Status</Text>
          <Text style={styles.statusValue}>{report.status === 'finalized' ? 'FINALIZED' : report.status}</Text>
        </View>

        {caseId ? (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>Case / Reference ID</Text>
            <Text style={styles.detailValue}>{caseId}</Text>
          </View>
        ) : null}

        {report.linkedCaseId ? (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>Linked Case ID</Text>
            <Text style={styles.detailValue}>{report.linkedCaseId}</Text>
          </View>
        ) : null}

        {contractor ? (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>Contractor</Text>
            <Text style={styles.detailValue}>{contractor}</Text>
          </View>
        ) : null}

        {client ? (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>Client</Text>
            <Text style={styles.detailValue}>{client}</Text>
          </View>
        ) : null}

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Defect Statement</Text>
          <Text style={styles.detailValue}>{getDefectEvidenceText(report)}</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Signature Capture</Text>
          <Text style={report.signatureCaptured ? styles.statusValue : styles.detailValue}>
            {report.signatureCaptured ? 'CAPTURED' : 'NOT CAPTURED'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>Generated automatically by BauCompliance.ch from the finalized protocol record.</Text>
        <Text>This document is for informational purposes and does not constitute formal legal advice.</Text>
      </View>
    </Page>
  </Document>
);
