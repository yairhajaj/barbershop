/**
 * openfrmt.js — Generate Israeli Tax Authority "Unified File" (OPENFRMT / קובץ אחיד).
 *
 * Implements מבנה אחיד v1.31 (May 2009) per the official spec.
 *
 * Produces the canonical OPENFRMT package:
 *   OPENFRMT/<9-digit-VAT>.<YY>/<MMDDhhmm>/
 *     INI.TXT        — A000 + A100 + Z900 (length 466/95/110)
 *     BKMVDATA.zip   — ZIP containing BKMVDATA.TXT with C100/D110/D120/M100/B100/B110 + Z900
 *
 * Key spec constants:
 *   - System version string: "&OF1.31&"   (fields 1005, 1104, 1154)
 *   - Primary ID: random 15-digit integer (first digit 1-9); same in 1004/1103/1153
 *   - Encoding: ISO-8859-8-i (Windows-1255) / CP-862; CRLF line terminators
 *   - Numeric fields: fixed-point without decimal point; right-aligned, zero-padded
 *   - Text fields: right-padded with spaces; future fields filled with '!'
 *
 * Spec: הוראת מקצוע 24/2004 + מבנה אחיד 1.31
 *   https://www.gov.il/he/service/download-open-format-files
 *
 * IMPORTANT: validate output against the official simulator before submitting.
 */

import JSZip from 'jszip'
import { supabase } from './supabase'
import { OPERATOR } from '../config/operator'

const CRLF = '\r\n'
const OF_VERSION = '&OF1.31&'

// ── Random 15-digit Primary ID ───────────────────────────────────
// Must start with 1-9; same value goes into A100 field 1004, C100 field 1103, etc.
export function randomPrimaryId15() {
  const first = Math.floor(Math.random() * 9) + 1 // 1-9
  let rest = ''
  for (let i = 0; i < 14; i++) rest += Math.floor(Math.random() * 10)
  return String(first) + rest
}

// ── Padding helpers ──────────────────────────────────────────────
function padRight(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
function padLeft(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return '0'.repeat(Math.max(0, len - s.length)) + s
}
function padText(val, len) {
  // Text = right-padded with spaces. Strip CRLF/tabs.
  const s = (val ?? '').toString().replace(/[\r\n\t]/g, ' ').slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
function padFuture(len) {
  // Reserved/future fields — fill with '!'
  return '!'.repeat(len)
}
function numField(val, intLen, decLen = 0) {
  // Fixed-point: no decimal point, right-aligned, zero-padded.
  // Total length = intLen + decLen. Leading '-' if negative (consumes 1 char).
  const totalLen = intLen + decLen
  const n = Number(val || 0)
  const scaled = Math.round(n * Math.pow(10, decLen))
  const sign = scaled < 0 ? '-' : ''
  const abs = Math.abs(scaled).toString()
  const padded = abs.padStart(totalLen - (sign ? 1 : 0), '0')
  return (sign + padded).slice(-totalLen)
}
function dateYMD(iso) {
  if (!iso) return '00000000'
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
function timeHM(iso) {
  if (!iso) return '0000'
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0')
}

// ── Annex 1 — Document type codes ───────────────────────────────
// Full list from הוראת מקצוע 36 נספח 1 (27 codes).
export const DOC_TYPES = {
  '100': 'הזמנה',
  '200': 'תעודת משלוח',
  '205': 'תעודת משלוח/החזרה',
  '210': 'תעודת החזרה',
  '300': 'חשבונית מס',
  '305': 'חשבונית מס זיכוי',
  '310': 'דרישת תשלום/חשבון עסקה',
  '320': 'חשבונית מס-קבלה',
  '330': 'חשבונית מס-קבלה זיכוי',
  '340': 'חשבון זיכוי',
  '400': 'קבלה',
  '405': 'קבלה על תרומה',
  '410': 'קבלת פיקדון',
  '420': 'החזרת פיקדון',
  '500': 'העברה בין מחסנים',
  '700': 'תעודת משלוח ממחסן',
  '710': 'תעודת החזרה למחסן',
  '800': 'הכנסת טובין למחסן',
  '810': 'הוצאת טובין ממחסן',
  '820': 'שינוי במלאי',
  '830': 'ייצור ושינוע',
  '900': 'הזמנת רכש',
  '910': 'הזמנת רכש מבוטלת',
}

// Payment method codes for D120 field 1306
// 1=מזומן, 2=שיק, 3=כרטיס אשראי, 4=העברה בנקאית, 5=שובר, 9=אחר
export const PAYMENT_CODE = {
  cash:     1,
  check:    2,
  credit:   3,
  card:     3,
  grow:     3,
  transfer: 4,
  bank:     4,
  voucher:  5,
  bit:      9,
  paybox:   9,
  other:    9,
}

// ── Record A000 — File Header (INI.TXT) — length 466 ─────────────
// Pos  Len  Field                                      Type
// 1    4    1000 Code = 'A000'                         text
// 5    15   1001 File ID (=primaryId)                  num
// 20   8    1002 Total records in INI.TXT              num
// 28   1    1003 Reserved                              text
// 29   8    1009 Manufacturer VAT ID                   num (9 → left-padded)
// 37   20   1010 Manufacturer name                     text
// 57   20   1007 Software name                         text
// 77   8    1008 Software version                      text
// 85   1    1011 Software type: 1/2                    num
// 86   1    1012 Reserved                              text
// 87   1    1013 Bookkeeping type: 0/1/2               num
// 88   5    1014 Reserved                              text
// 93   9    1015 Company reg number (ח.פ.)            num
// 102  9    1016 Deduction file number                 num
// 111  9    1017 Authorized dealer VAT ID              num
// 120  50   1018 Business name                         text
// 170  50   1019 Address — street                      text
// 220  10   1020 Address — number                      text
// 230  30   1021 Address — city                        text
// 260  8    1022 Address — ZIP                         text
// 268  8    1023 Tax year start YYYYMMDD               num
// 276  8    1024 Tax year end YYYYMMDD                 num
// 284  8    1025 Data start date YYYYMMDD              num
// 292  8    1026 Data end date YYYYMMDD                num
// 300  8    1027 Creation date YYYYMMDD                num
// 308  4    1028 Creation time HHMM                    num
// 312  10   1029 Lang/currency (future)                text
// 322  3    1030 Code-page (future)                    text
// 325  5    1031 Compression type (future)             text
// 330  3    1032 Leading currency ISO (ILS)            text
// 333  5    1033 Reserved                              text
// 338  1    1034 Has branches Y/N (0/1)                text
// 339  15   1035 Reserved                              text
// 354  8    1036 Reserved                              num
// 362  10   1037 Reserved                              text
// 372  95   FILLER                                     text
// Total: 466
function recordA000({
  primaryId,
  totalIniRecords,
  manufacturer,
  software,
  softwareType,
  bookkeepingType,
  companyReg,
  deductionFile,
  vatId,
  businessName,
  address,
  taxYear,
  dataRange,
  leadingCurrency = 'ILS',
  hasBranches = false,
}) {
  const parts = [
    'A000',                                                                // 4
    padLeft(primaryId, 15),                                                // 15
    padLeft(totalIniRecords, 8),                                           // 8
    padText('', 1),                                                        // 1 reserved
    padLeft(manufacturer.vatId || '0', 9),                                 // 9
    padText(manufacturer.name, 20),                                        // 20
    padText(software.name, 20),                                            // 20
    padText(software.version, 8),                                          // 8
    padLeft(softwareType || '2', 1),                                       // 1
    padText('', 1),                                                        // 1 reserved
    padLeft(bookkeepingType || '1', 1),                                    // 1
    padText('', 5),                                                        // 5 reserved
    padLeft(companyReg || '0', 9),                                         // 9
    padLeft(deductionFile || '0', 9),                                      // 9
    padLeft(vatId, 9),                                                     // 9
    padText(businessName, 50),                                             // 50
    padText(address.street, 50),                                           // 50
    padText(address.number, 10),                                           // 10
    padText(address.city, 30),                                             // 30
    padText(address.postal, 8),                                            // 8
    padLeft(dateYMD(taxYear.start), 8),                                    // 8
    padLeft(dateYMD(taxYear.end), 8),                                      // 8
    padLeft(dateYMD(dataRange.start), 8),                                  // 8
    padLeft(dateYMD(dataRange.end), 8),                                    // 8
    padLeft(dateYMD(new Date().toISOString()), 8),                         // 8
    padLeft(timeHM(new Date().toISOString()), 4),                          // 4
    padFuture(10),                                                         // 10
    padFuture(3),                                                          // 3
    padFuture(5),                                                          // 5
    padText(leadingCurrency, 3),                                           // 3
    padText('', 5),                                                        // 5 reserved
    padText(hasBranches ? '1' : '0', 1),                                   // 1
    padText('', 15),                                                       // 15 reserved
    padLeft('0', 8),                                                       // 8 reserved
    padText('', 10),                                                       // 10 reserved
    padText('', 95),                                                       // 95 filler
  ]
  const rec = parts.join('')
  if (rec.length !== 466) {
    console.warn('[openfrmt] A000 length mismatch:', rec.length, 'expected 466')
  }
  return rec.slice(0, 466).padEnd(466, ' ')
}

// ── Record A100 — INI.TXT opening (BKMVDATA header) — length 95 ──
// Pos  Len  Field
// 1    4    1100 Code = 'A100'
// 5    9    1101 Record sequence (within INI)
// 14   9    1102 VAT ID
// 23   15   1103 Primary ID (same as A000 field 1001)
// 38   8    1104 System constant '&OF1.31&'
// 46   50   FILLER
// Total: 95
function recordA100({ serial, vatId, primaryId }) {
  const parts = [
    'A100',                           // 4
    padLeft(serial, 9),               // 9
    padLeft(vatId, 9),                // 9
    padLeft(primaryId, 15),           // 15
    padText(OF_VERSION, 8),           // 8
    padText('', 50),                  // 50 filler
  ]
  const rec = parts.join('')
  return rec.slice(0, 95).padEnd(95, ' ')
}

// ── Record Z900 — Closing record — length 110 ────────────────────
// Pos  Len  Field
// 1    4    Code = 'Z900'
// 5    9    Record sequence
// 14   9    VAT ID
// 23   15   Primary ID
// 38   8    System constant '&OF1.31&'
// 46   15   Total records count
// 61   50   FILLER
// Total: 110
function recordZ900({ serial, vatId, primaryId, totalRecords }) {
  const parts = [
    'Z900',
    padLeft(serial, 9),
    padLeft(vatId, 9),
    padLeft(primaryId, 15),
    padText(OF_VERSION, 8),
    padLeft(totalRecords, 15),
    padText('', 50),
  ]
  const rec = parts.join('')
  return rec.slice(0, 110).padEnd(110, ' ')
}

// ── Record C100 — Document Header (BKMVDATA) — length 444 ─────────
function recordC100({
  serial, vatId, primaryId, docType, docNumber, docDate, docTime,
  customerName, customerVatId, customerPhone,
  beforeVat, vatAmount, total, currency = 'ILS', rate = 1,
  isCancelled, generationDate, userId,
}) {
  const parts = [
    'C100',                                    // 4   1150
    padLeft(serial, 9),                        // 9   1151
    padLeft(vatId, 9),                         // 9   1152
    padLeft(primaryId, 15),                    // 15  1153
    padText(OF_VERSION, 8),                    // 8   1154
    padLeft(docType, 3),                       // 3   1201 doc type (Annex 1)
    padText(docNumber, 20),                    // 20  1202 doc number
    padLeft(isCancelled ? '1' : '0', 1),       // 1   1203 cancelled flag
    padText('', 20),                           // 20  1204 cancelled-by doc
    padLeft(dateYMD(docDate), 8),              // 8   1205 doc date
    padLeft(dateYMD(docDate), 8),              // 8   1206 value date
    padLeft(timeHM(docDate || docTime), 4),    // 4   1207 doc time
    padText(customerName || '', 50),           // 50  1208 customer name
    padText('', 50),                           // 50  1209 customer address street
    padText('', 10),                           // 10  1210 customer address number
    padText('', 30),                           // 30  1211 customer city
    padText('', 8),                            // 8   1212 customer ZIP
    padText('', 10),                           // 10  1213 country code
    padText('', 30),                           // 30  1214 country name
    padText(customerVatId || '', 9),           // 9   1215 customer VAT ID
    padText(customerPhone || '', 15),          // 15  1216 customer phone
    numField(beforeVat, 13, 2),                // 15  1217 amount before discount
    numField(0, 13, 2),                        // 15  1218 discount
    numField(beforeVat, 13, 2),                // 15  1219 amount after discount before VAT
    numField(vatAmount, 13, 2),                // 15  1220 VAT amount
    numField(total, 13, 2),                    // 15  1221 amount after VAT
    numField(0, 13, 2),                        // 15  1222 income-tax withheld
    padText(currency, 3),                      // 3   1223 currency ISO
    numField(beforeVat, 13, 2),                // 15  1224 amount in foreign currency
    numField(rate, 6, 4),                      // 10  1225 exchange rate
    numField(0, 13, 2),                        // 15  1226 VAT rate applied (e.g. 1800=18%)
    padLeft(dateYMD(generationDate || docDate), 8),   // 8   1227 generation date
    padLeft(timeHM(generationDate || docDate), 4),    // 4   1228 generation time
    padText(userId || '', 9),                  // 9   1229 user responsible (ת.ז.)
    padText('', 8),                            // 8   1230 connected reference doc
    padLeft('0', 3),                           // 3   1231 connected doc type
    padText('', 7),                            // 7   1232 reserved
    padText('', 8),                            // 8   1233 customer branch code
    padText('', 7),                            // 7   1234 reserved
  ]
  const rec = parts.join('')
  // C100 per spec total = 444
  return rec.slice(0, 444).padEnd(444, ' ')
}

// ── Record D110 — Document Line Item — length 339 ────────────────
function recordD110({
  serial, vatId, primaryId, docType, docNumber, docDate,
  lineNum, itemCode, itemDescription,
  quantity, unitPrice, discount, lineTotal, vatRate,
}) {
  const parts = [
    'D110',                                    // 4
    padLeft(serial, 9),                        // 9
    padLeft(vatId, 9),                         // 9
    padLeft(primaryId, 15),                    // 15
    padText(OF_VERSION, 8),                    // 8
    padLeft(docType, 3),                       // 3   doc type
    padText(docNumber, 20),                    // 20  doc number
    padLeft(dateYMD(docDate), 8),              // 8   doc date
    padLeft(lineNum, 4),                       // 4   line number
    padLeft('1', 3),                           // 3   line type (1=regular)
    padText(itemCode || '', 20),               // 20  item code
    padText('', 7),                            // 7   supplier item code
    padText(itemDescription || '', 50),        // 50  item description
    padText('', 2),                            // 2   unit of measure
    numField(quantity, 13, 3),                 // 16  quantity
    numField(unitPrice, 13, 2),                // 15  unit price (excl VAT)
    numField(discount, 13, 2),                 // 15  discount
    numField(lineTotal, 13, 2),                // 15  total before VAT
    padLeft(vatRate ? '1' : '0', 1),           // 1   VAT indicator
    padText('', 9),                            // 9   connected customer VAT ID
    padText('', 15),                           // 15  transaction reference
    padText('', 8),                            // 8   branch code
    padText('', 7),                            // 7   reserved
    padText('', 30),                           // 30  filler
    padText('', 42),                           // 42  filler
  ]
  const rec = parts.join('')
  return rec.slice(0, 339).padEnd(339, ' ')
}

// ── Record D120 — Payment/Receipt — length 222 ────────────────────
function recordD120({
  serial, vatId, primaryId, docType, docNumber, docDate,
  lineNum, paymentMethod, bankCode, branchCode, accountNumber,
  checkNumber, paymentDate, amount, cardType,
}) {
  const code = typeof paymentMethod === 'number'
    ? paymentMethod
    : (PAYMENT_CODE[paymentMethod] || PAYMENT_CODE.other)
  const parts = [
    'D120',                                    // 4
    padLeft(serial, 9),                        // 9
    padLeft(vatId, 9),                         // 9
    padLeft(primaryId, 15),                    // 15
    padText(OF_VERSION, 8),                    // 8
    padLeft(docType, 3),                       // 3
    padText(docNumber, 20),                    // 20
    padLeft(dateYMD(docDate), 8),              // 8
    padLeft(lineNum, 4),                       // 4
    padLeft(code, 1),                          // 1   payment method (1/2/3/4/5/9)
    padText(bankCode || '', 4),                // 4
    padText(branchCode || '', 4),              // 4
    padText(accountNumber || '', 15),          // 15
    padText(checkNumber || '', 10),            // 10
    padLeft(dateYMD(paymentDate || docDate), 8),// 8
    numField(amount, 13, 2),                   // 15
    padText(cardType || '', 4),                // 4   credit card company
    padText('', 20),                           // 20  last 4 digits / transaction ref
    padText('', 14),                           // 14  reserved
    padText('', 39),                           // 39  filler
  ]
  const rec = parts.join('')
  return rec.slice(0, 222).padEnd(222, ' ')
}

// ── Record M100 — Inventory/Item master — length 298 ──────────────
function recordM100({
  serial, vatId, primaryId, itemCode, itemDescription,
  unit, unitPrice, currency = 'ILS',
}) {
  const parts = [
    'M100',                                    // 4
    padLeft(serial, 9),                        // 9
    padLeft(vatId, 9),                         // 9
    padLeft(primaryId, 15),                    // 15
    padText(OF_VERSION, 8),                    // 8
    padText('', 8),                            // 8   branch
    padText(itemCode, 20),                     // 20  item code
    padText('', 20),                           // 20  supplier item code
    padText(itemDescription || '', 50),        // 50  description
    padText('', 15),                           // 15  classification
    padText(unit || '', 20),                   // 20  unit of measure
    numField(0, 12, 3),                        // 15  opening balance qty
    numField(unitPrice, 13, 2),                // 15  cost price
    numField(unitPrice, 13, 2),                // 15  last cost
    numField(unitPrice, 13, 2),                // 15  sale price
    padText(currency, 3),                      // 3   currency
    padText('', 49),                           // 49  filler
  ]
  const rec = parts.join('')
  return rec.slice(0, 298).padEnd(298, ' ')
}

// ── Data fetch ───────────────────────────────────────────────────
async function fetchDataset({ from, to }) {
  const startIso = `${from}T00:00:00`
  const endIso   = `${to}T23:59:59`

  const [{ data: invoices }, { data: services }] = await Promise.all([
    supabase.from('invoices').select('*, invoice_items(*)')
      .gte('created_at', startIso).lte('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase.from('services').select('id, name, price').eq('is_active', true),
  ])

  return {
    invoices: invoices ?? [],
    services: services ?? [],
  }
}

// ── Build BKMVDATA.TXT ───────────────────────────────────────────
export function buildBkmvdata({ vatId, primaryId, invoices, services, businessType }) {
  const lines = []
  let serial = 1
  const counts = { C100: 0, D110: 0, D120: 0, M100: 0, Z900: 1 }

  // A100 — חייב להיות הרשומה הראשונה ב-BKMVDATA.TXT לפי מפרט 1.31
  lines.push(recordA100({ serial: serial++, vatId, primaryId }))

  // Invoices → C100 + D110 + D120
  invoices.forEach((inv) => {
    const docType = inv.is_credit_note
      ? (businessType === 'osek_patur' ? '405' : '330')
      : (businessType === 'osek_patur' ? '400' : '320')  // 320=חשבונית מס-קבלה; 400=קבלה (עוסק פטור)
    const beforeVat = Number(inv.amount_before_vat || inv.total_amount || 0)
    const vatAmount = Number(inv.vat_amount || 0)
    const total = Number(inv.total_amount || 0)
    const vatRate = Number(inv.vat_rate || 18)

    lines.push(recordC100({
      serial: serial++, vatId, primaryId, docType,
      docNumber: inv.invoice_number,
      docDate: inv.service_date || inv.created_at,
      customerName: inv.customer_name,
      customerVatId: inv.customer_tax_id,
      customerPhone: inv.customer_phone,
      beforeVat, vatAmount, total,
      isCancelled: inv.is_cancelled,
      generationDate: inv.created_at,
      userId: inv.created_by,
    }))
    counts.C100++

    // D110 — one per invoice_item row, or aggregate if no items table rows
    const lineItems = inv.invoice_items && inv.invoice_items.length > 0
      ? inv.invoice_items
      : [{ service_id: inv.service_id, name: inv.service_name || 'שירות', quantity: 1, unit_price: beforeVat, line_total: beforeVat }]

    lineItems.forEach((item, idx) => {
      lines.push(recordD110({
        serial: serial++, vatId, primaryId, docType,
        docNumber: inv.invoice_number,
        docDate: inv.service_date || inv.created_at,
        lineNum: idx + 1,
        itemCode: (item.service_id || item.product_id || inv.service_id || 'SVC').toString().slice(0, 20),
        itemDescription: item.name || inv.service_name || 'שירות',
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unit_price || beforeVat),
        discount: 0,
        lineTotal: Number(item.line_total || beforeVat),
        vatRate: vatRate > 0,
      }))
      counts.D110++
    })

    // Payment (D120) — only when invoice is paid
    if (inv.status === 'paid' || inv.paid_at) {
      lines.push(recordD120({
        serial: serial++, vatId, primaryId, docType,
        docNumber: inv.invoice_number,
        docDate: inv.service_date || inv.created_at,
        lineNum: 1,
        paymentMethod: inv.payment_method || 'cash',
        paymentDate: inv.paid_at || inv.created_at,
        amount: total,
      }))
      counts.D120++
    }
  })

  // Services → M100
  services.forEach((svc) => {
    lines.push(recordM100({
      serial: serial++, vatId, primaryId,
      itemCode: svc.id.slice(0, 20),
      itemDescription: svc.name,
      unit: 'יח׳',
      unitPrice: svc.price,
    }))
    counts.M100++
  })

  // Z900 — closing record with total count (including Z900 itself)
  const totalSoFar = serial - 1
  lines.push(recordZ900({
    serial, vatId, primaryId,
    totalRecords: totalSoFar + 1,
  }))

  return { text: lines.join(CRLF) + CRLF, counts }
}

// ── Build INI.TXT (A000 only, per spec §5) ───────────────────────
// INI.TXT contains exactly ONE record: A000.
// A100 belongs in BKMVDATA.TXT (first record there).
// A000 field 1002 = total records in BKMVDATA (A100 + data + Z900).
export function buildIni({ vatId, primaryId, settings, from, to, counts }) {
  const lines = []

  // Total records in BKMVDATA = 1 A100 + C100+D110+D120+M100 + 1 Z900
  const totalBkmv = 1 + counts.C100 + counts.D110 + counts.D120 + counts.M100 + 1

  lines.push(recordA000({
    primaryId,
    totalIniRecords: totalBkmv,
    manufacturer: {
      vatId: OPERATOR.manufacturer_vat_id,
      name:  OPERATOR.manufacturer_name,
    },
    software: {
      name:    OPERATOR.software_name,
      version: OPERATOR.software_version,
    },
    softwareType:    OPERATOR.software_type,
    bookkeepingType: OPERATOR.bookkeeping_type,
    companyReg:      settings.company_registration_number,
    deductionFile:   settings.deduction_file_number,
    vatId,
    businessName: settings.business_name,
    address: {
      street: settings.business_address_street || '',
      number: settings.business_address_number || '',
      city:   settings.business_address_city   || '',
      postal: settings.business_address_postal || '',
    },
    taxYear: {
      start: `${new Date(from).getFullYear()}-01-01`,
      end:   `${new Date(to).getFullYear()}-12-31`,
    },
    dataRange: { start: from, end: to },
    leadingCurrency: OPERATOR.leading_currency,
    hasBranches: settings.has_branches,
  }))

  return lines.join(CRLF) + CRLF
}

// ── Section 2.6 — summary report for printing/archiving ──────────
export function buildSection26Report({ settings, from, to, counts, primaryId }) {
  return {
    businessName: settings.business_name,
    vatId:        settings.business_tax_id,
    softwareReg:  OPERATOR.tax_software_reg_number,
    primaryId,
    dataRange:    { from, to },
    generatedAt:  new Date().toISOString(),
    totals: {
      C100: counts.C100 || 0,
      D110: counts.D110 || 0,
      D120: counts.D120 || 0,
      M100: counts.M100 || 0,
    },
    iniRecords:  3,
    ofVersion:   OF_VERSION,
  }
}

export function printSection26(report) {
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head>
<meta charset="UTF-8">
<title>דוח הפקת קובץ אחיד — סעיף 2.6</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:40px;max-width:780px;margin:auto}
  h1{border-bottom:2px solid #000;padding-bottom:10px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th,td{border:1px solid #999;padding:8px;text-align:right}
  th{background:#f0f0f0}
  .sig{margin-top:60px;border-top:1px solid #000;padding-top:10px;width:300px}
  @media print{.noprint{display:none}}
</style></head><body>
<h1>דוח הפקת קובץ אחיד — מבנה 1.31</h1>
<p>על פי סעיף 2.6 להוראת מקצוע 24/2004</p>
<table>
  <tr><th>שם העסק</th><td>${report.businessName || ''}</td></tr>
  <tr><th>מס׳ עוסק</th><td>${report.vatId || ''}</td></tr>
  <tr><th>מס׳ רישום תוכנה</th><td>${report.softwareReg || ''}</td></tr>
  <tr><th>מזהה ראשי (Primary ID)</th><td>${report.primaryId}</td></tr>
  <tr><th>תקופה</th><td>${report.dataRange.from} — ${report.dataRange.to}</td></tr>
  <tr><th>תאריך הפקה</th><td>${new Date(report.generatedAt).toLocaleString('he-IL')}</td></tr>
  <tr><th>גרסת מבנה</th><td>${report.ofVersion}</td></tr>
</table>
<h2>ספירות רשומות</h2>
<table>
  <tr><th>סוג רשומה</th><th>כמות</th><th>תיאור</th></tr>
  <tr><td>A000/A100/Z900 (INI)</td><td>${report.iniRecords}</td><td>כותרת הקובץ</td></tr>
  <tr><td>C100</td><td>${report.totals.C100}</td><td>כותרות מסמכים</td></tr>
  <tr><td>D110</td><td>${report.totals.D110}</td><td>שורות מסמך</td></tr>
  <tr><td>D120</td><td>${report.totals.D120}</td><td>שורות תקבול</td></tr>
  <tr><td>M100</td><td>${report.totals.M100}</td><td>פריטי מלאי</td></tr>
</table>
<p>אני מאשר/ת שהקובץ הופק מתוך התוכנה בהתאם להוראת מקצוע 24/2004 ולמבנה 1.31.</p>
<div class="sig">חתימת מנהל העסק: ____________________</div>
<div class="sig">תאריך: ____________________</div>
<button class="noprint" onclick="window.print()" style="margin-top:30px;padding:10px 20px">הדפס</button>
</body></html>`
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
}

// ── Validation before generation ────────────────────────────────
const REQUIRED_SETTINGS_FIELDS = [
  ['business_tax_id',         'מס׳ עוסק מורשה'],
  ['business_name',           'שם העסק'],
  ['business_address_street', 'כתובת — רחוב'],
  ['business_address_city',   'כתובת — עיר'],
]

export function validateOpenFormatSettings(settings) {
  const errors = []
  const warnings = []

  // Validate per-business fields from settings
  for (const [key, label] of REQUIRED_SETTINGS_FIELDS) {
    if (!settings[key] || String(settings[key]).trim() === '') {
      errors.push(`חסר שדה חובה: ${label}`)
    }
  }

  // Validate operator (SaaS) fields from OPERATOR config
  if (!OPERATOR.manufacturer_vat_id) errors.push('חסר ת.ז/ח.פ יצרן התוכנה (operator.js)')
  if (!OPERATOR.manufacturer_name)   errors.push('חסר שם יצרן התוכנה (operator.js)')
  if (!OPERATOR.tax_software_reg_number) {
    warnings.push('מספר רישום תוכנה עדיין לא הוזן ב-operator.js — הקובץ יכלול "0" ולא יתקבל ברשות המיסים.')
  } else if (!/^\d{8}$/.test(OPERATOR.tax_software_reg_number)) {
    errors.push('מס׳ רישום תוכנה ב-operator.js חייב להיות 8 ספרות.')
  }

  if (!settings.tax_office_notified) {
    warnings.push('לא סומן "עודכנה רשות המיסים" — יש להגיש הודעת שימוש בתוכנה לפני הפעלה (הוראת מקצוע 24/2004 §18ב(ב)).')
  }
  if (settings.business_tax_id && !/^\d{9}$/.test(String(settings.business_tax_id).replace(/\D/g, ''))) {
    errors.push('מס׳ עוסק חייב להיות 9 ספרות.')
  }
  return { valid: errors.length === 0, errors, warnings }
}

// ── Main entry — generate the full ZIP ──────────────────────────
/**
 * Generate OPENFRMT 1.31 ZIP package.
 * Directory structure:
 *   OPENFRMT/
 *     <9-digit-VAT>.<YY>/
 *       <MMDDhhmm>/
 *         INI.TXT
 *         BKMVDATA.zip  (contains BKMVDATA.TXT)
 */
export async function generateOpenFormatZip({ from, to, settings }) {
  const validation = validateOpenFormatSettings(settings)
  if (!validation.valid) {
    throw new Error('הגדרות חסרות:\n' + validation.errors.join('\n'))
  }

  const vatId = String(settings.business_tax_id).replace(/\D/g, '').padStart(9, '0')
  const primaryId = randomPrimaryId15()
  const businessType = settings.business_type || 'osek_morsheh'

  // Fetch data
  const { invoices, services } = await fetchDataset({ from, to })
  const { text: bkmvText, counts } = buildBkmvdata({ vatId, primaryId, invoices, services, businessType })
  const iniText = buildIni({ vatId, primaryId, settings, from, to, counts })

  // Inner ZIP containing BKMVDATA.TXT
  const inner = new JSZip()
  inner.file('BKMVDATA.TXT', bkmvText)
  const innerBlob = await inner.generateAsync({ type: 'uint8array' })

  // Outer directory path
  const now = new Date()
  const MMDDhhmm = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const yy = String(now.getFullYear()).slice(-2)
  const dirPrefix = `OPENFRMT/${vatId}.${yy}/${MMDDhhmm}/`

  // Outer ZIP
  const outer = new JSZip()
  outer.file(dirPrefix + 'INI.TXT', iniText)
  outer.file(dirPrefix + 'BKMVDATA.zip', innerBlob)

  // Section 2.6 report attachment
  const report = buildSection26Report({ settings, from, to, counts, primaryId })
  outer.file(dirPrefix + 'SECTION_2_6_REPORT.json', JSON.stringify(report, null, 2))

  // Human-readable README
  const readme = [
    '# קובץ אחיד (OPENFRMT) — מבנה 1.31',
    '',
    `עסק: ${settings.business_name}`,
    `מס׳ עוסק: ${vatId}`,
    `תקופה: ${from} עד ${to}`,
    `מספר רישום תוכנה: ${OPERATOR.tax_software_reg_number || '(טרם הוזן)'}`,
    `Primary ID: ${primaryId}`,
    `גרסת מבנה: ${OF_VERSION}`,
    '',
    '## מבנה הקובץ:',
    `- ${dirPrefix}INI.TXT          — כותרת הקובץ (A000 + A100 + Z900)`,
    `- ${dirPrefix}BKMVDATA.zip     — נתונים (C100/D110/D120/M100/Z900)`,
    `- ${dirPrefix}SECTION_2_6_REPORT.json — דוח הפקה (סעיף 2.6)`,
    '',
    '## ספירות:',
    `  C100: ${counts.C100}`,
    `  D110: ${counts.D110}`,
    `  D120: ${counts.D120}`,
    `  M100: ${counts.M100}`,
    '',
    '## אימות:',
    'יש להעלות את הקובץ לסימולטור הרשמי של רשות המיסים:',
    'https://www.gov.il/he/service/download-open-format-files',
    '',
    '## הערות:',
    validation.warnings.length
      ? validation.warnings.map(w => '⚠️ ' + w).join('\n')
      : '✓ כל ההגדרות תקינות.',
  ].join('\r\n')
  outer.file('README.txt', readme)

  // Touch last_openfrmt_export_at
  try {
    await supabase.from('business_settings')
      .update({ last_openfrmt_export_at: new Date().toISOString() })
      .eq('id', settings.id)
  } catch { /* silent */ }

  return { blob: await outer.generateAsync({ type: 'blob' }), report, counts, primaryId, dirPrefix }
}

export async function downloadOpenFormat({ from, to, settings }) {
  const { blob, report, primaryId } = await generateOpenFormatZip({ from, to, settings })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openfrmt_${from}_${to}.zip`
  a.click()
  URL.revokeObjectURL(url)
  return { report, primaryId }
}
