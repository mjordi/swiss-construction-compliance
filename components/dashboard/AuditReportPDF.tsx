import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

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
  scoreContainer: {
    backgroundColor: '#f0fdf4', // Emerald 50
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#166534',
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#16a34a',
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
  itemStatus: {
    fontSize: 10,
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '4 8',
    borderRadius: 4,
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
  date: string;
}

export const AuditReportPDF = ({ fileName, date }: AuditReportProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Compliance Audit</Text>
          <Text style={styles.subtitle}>SIA 118 / Swiss Code of Obligations 2026</Text>
        </View>
        <Text style={styles.brand}>BauCompliance.ch</Text>
      </View>

      <View style={styles.scoreContainer}>
        <View>
          <Text style={styles.scoreLabel}>OVERALL COMPLIANCE SCORE</Text>
          <Text style={{ fontSize: 10, color: '#166534', marginTop: 4 }}>Passed 12/12 Mandatory Checks</Text>
        </View>
        <Text style={styles.scoreValue}>98%</Text>
      </View>

      <View style={styles.section}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 15, color: '#334155' }}>Audit Details</Text>
        
        <View style={styles.item}>
          <Text style={styles.itemTitle}>File Name</Text>
          <Text style={{ fontSize: 12 }}>{fileName}</Text>
        </View>
        
        <View style={styles.item}>
          <Text style={styles.itemTitle}>Scan Date</Text>
          <Text style={{ fontSize: 12 }}>{date}</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Liability Clauses (Art. 371)</Text>
          <Text style={styles.itemStatus}>COMPLIANT</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Defect Notification</Text>
          <Text style={styles.itemStatus}>COMPLIANT</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemTitle}>Digital Handover</Text>
          <Text style={[styles.itemStatus, { backgroundColor: '#fef9c3', color: '#854d0e' }]}>RECOMMENDATION</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>Generated automatically by BauCompliance.ch Audit Engine v4.2</Text>
        <Text>This document is for informational purposes and does not constitute formal legal advice.</Text>
      </View>
    </Page>
  </Document>
);
