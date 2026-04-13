import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatDate, formatTime, priceDisplay } from './utils'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    padding: 40,
    backgroundColor: '#ffffff',
    direction: 'rtl',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 32,
    borderBottomWidth: 2,
    borderBottomColor: '#c9a96e',
    paddingBottom: 16,
  },
  businessName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  businessDetails: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 1.6,
  },
  invoiceTitle: {
    fontSize: 28,
    color: '#c9a96e',
    fontFamily: 'Helvetica-Bold',
  },
  invoiceNum: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: {
    color: '#6b7280',
    fontSize: 10,
  },
  rowValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#1a1a1a',
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
  },
  totalValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#c9a96e',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
})

export function InvoicePDF({ appointment, business, footerText }) {
  const invoiceNum = `INV-${appointment.id.slice(0, 8).toUpperCase()}`
  const price = Number(appointment.services?.price) || 0
  const vat = Math.round(price * 0.17)
  const total = price

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{business.name}</Text>
            <Text style={styles.businessDetails}>
              {business.address}{'\n'}
              {business.phone}{'\n'}
              {business.email}
            </Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>חשבונית</Text>
            <Text style={styles.invoiceNum}>{invoiceNum}</Text>
            <Text style={styles.invoiceNum}>תאריך: {formatDate(appointment.start_at)}</Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי לקוח</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>שם</Text>
            <Text style={styles.rowValue}>{appointment.profiles?.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>טלפון</Text>
            <Text style={styles.rowValue}>{appointment.profiles?.phone || '-'}</Text>
          </View>
        </View>

        {/* Service Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי שירות</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>שירות</Text>
            <Text style={styles.rowValue}>{appointment.services?.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>ספר</Text>
            <Text style={styles.rowValue}>{appointment.staff?.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>תאריך</Text>
            <Text style={styles.rowValue}>{formatDate(appointment.start_at)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>שעה</Text>
            <Text style={styles.rowValue}>{formatTime(appointment.start_at)}</Text>
          </View>
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תשלום</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>מחיר לפני מע"מ</Text>
            <Text style={styles.rowValue}>₪{Math.round(price / 1.17)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>מע"מ (17%)</Text>
            <Text style={styles.rowValue}>₪{vat}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>סה"כ לתשלום</Text>
            <Text style={styles.totalValue}>₪{total}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{footerText || `תודה על בחירתך ב-${business.name}!`}</Text>
          <Text style={{ marginTop: 4 }}>
            {business.address} | {business.phone} | {business.email}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
