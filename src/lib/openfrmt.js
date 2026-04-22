/**
 * openfrmt.js — Israeli Tax Authority "Unified File" (OPENFRMT / קובץ אחיד) v1.31
 *
 * Record lengths per spec:
 *   A000 (INI.TXT only): 466
 *   A100: 95 | Z900: 110 | C100: 444 | D110: 339 | D120: 222 | M100: 298
 *
 * Key constants:
 *   System constant (fields 1005/1104/1154): '&OF1.31&' (8 chars)
 *   Dates: YYYYMMDD format throughout (fields 1024/1025/1026/1205/1216/1230/1264/1272/1311/1322)
 *   Numeric fields: n integer digits + decimal digits (zero-padded, no sign character)
 *   Encoding: Windows-1255 / ISO-8859-8-I (use ASCII-only for simulator)
 */

import JSZip from 'jszip'
import { supabase } from './supabase'
import { OPERATOR } from '../config/operator'

const CRLF     = '\r\n'
const BKMV_HDL = '&OF1.31&' // 8 chars — field 1005/1104/1154

// ── Padding helpers ──────────────────────────────────────────────
// Strip non-ASCII so Hebrew/Unicode chars don't inflate byte count in UTF-8 output
function toAscii(s) {
  return s.replace(/[^\x00-\x7F]/g, ' ')
}
function padRight(val, len) {
  const s = toAscii((val ?? '').toString()).slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
function padLeft(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return '0'.repeat(Math.max(0, len - s.length)) + s
}
function padText(val, len) {
  const s = toAscii((val ?? '').toString()).replace(/[\r\n\t]/g, ' ').slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
// Unsigned numeric field — pure zero-padded digits, no sign.
// Used only for non-monetary counters/codes (serial numbers, VAT IDs, etc.).
// Example: numField(80, 13, 2) → "000000000008000"
function numField(val, intLen, decLen = 0) {
  const totalLen = intLen + decLen
  const n = Number(val || 0)
  const scaled = Math.round(Math.abs(n) * Math.pow(10, decLen))
  return scaled.toString().padStart(totalLen, '0').slice(-totalLen)
}

// Signed numeric field — leading '+'/'-' sign, followed by (intLen+decLen) zero-padded digits.
// Total length = 1 + intLen + decLen.
// Per reference BKMVDATA.TXT (Cowork): "+00000000000800" (15 chars), "+0000000000010000" (17 chars).
// The sign is at position 0 (first char). Simulator error "התו המייצג סימן מכיל ערך שגוי"
// fires when position 0 is a digit ('0'-'9') instead of '+' or '-'.
function signedField(val, intLen, decLen = 0, forceNegative = false) {
  const n = Number(val || 0)
  const sign = (n < 0 || forceNegative) ? '-' : '+'
  const scaled = Math.round(Math.abs(n) * Math.pow(10, decLen))
  const digits = scaled.toString().padStart(intLen + decLen, '0').slice(-(intLen + decLen))
  return sign + digits
}

// ── Date helpers ─────────────────────────────────────────────────
// All BKMVDATA dates: YYYYMMDD format per spec
function dateYMD(iso) {
  if (!iso) return '00000000'
  const d = (iso instanceof Date) ? iso : new Date(iso)
  const year = d.getFullYear()
  const mon  = String(d.getMonth() + 1).padStart(2, '0')
  const day  = String(d.getDate()).padStart(2, '0')
  return `${year}${mon}${day}`
}
function timeHM(iso) {
  if (!iso) return '0000'
  const d = (iso instanceof Date) ? iso : new Date(iso)
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0')
}

// ── Random 15-digit Primary ID ───────────────────────────────────
export function randomPrimaryId15() {
  const first = Math.floor(Math.random() * 9) + 1
  let rest = ''
  for (let i = 0; i < 14; i++) rest += Math.floor(Math.random() * 10)
  return String(first) + rest
}

// ── Document type codes (Annex 1) ────────────────────────────────
export const DOC_TYPES = {
  '100': 'הזמנה',
  '300': 'חשבונית מס',
  '305': 'חשבונית מס זיכוי',
  '320': 'חשבונית מס-קבלה',
  '330': 'חשבונית מס-קבלה זיכוי',
  '400': 'קבלה',
  '405': 'קבלה על תרומה',
  '410': 'יציאה מקופה',
  '420': 'הפקדת בנק',
  '700': 'חשבונית מס רכש',
  '710': 'זיכוי רכש',
}

// Payment method codes for D120 field 1306
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

// ── Record A000 — INI.TXT header — 466 chars ─────────────────────
// Per spec §5 (מדריך_רישום_תוכנה_רשות_המסים.md):
// pos  len  field
//   0    4  1000 'A000'
//   4    5  1001 future use (spaces)
//   9   15  1002 total records in BKMVDATA (num)
//  24    9  1003 business VAT ID (num)
//  33   15  1004 primary ID (num)
//  48    8  1005 '&OF1.31&' (str)
//  56    8  1006 software reg number (num) — 8 digits from tax authority
//  64   20  1007 software name (str)
//  84   20  1008 software version (str)
// 104    9  1009 manufacturer VAT ID (num)
// 113   20  1010 manufacturer name (str)
// 133    1  1011 software type: 2=multi-year (num)
// 134   50  1012 file save path (str)
// 184    1  1013 bookkeeping type: 1=single, 2=double (num)
// 185    1  1014 accounting balance required: 0=no (num)
// 186    9  1015 company reg number (num)
// 195    9  1016 deduction file number (num)
// 204   10  1017 future (spaces)
// 214   50  1018 business name (str)
// 264   50  1019 address street (str)
// 314   10  1020 address house number (str)
// 324   30  1021 address city (str)
// 354    8  1022 postal code (str)
// 362    4  1023 tax year YYYY (num)
// 366    8  1024 data start date YYYYMMDD (num)
// 374    8  1025 data end date YYYYMMDD (num)
// 382    8  1026 process date YYYYMMDD (num)
// 390    4  1027 process time HHMM (num)
// 394    1  1028 language code: 0=Hebrew (num)
// 395    1  1029 character set: 1=ISO-8859-8-i (num)
// 396   20  1030 compression software name (str)
// 416    3  1032 leading currency ISO (str)
// 419    1  1034 has branches: 0/1 (num)
// 420   46  1035 future (spaces)
// Total: 466
function recordA000({
  primaryId, totalBkmvRecords, vatId, settings, dataRange,
}) {
  const now = new Date()
  const parts = [
    'A000',                                                              // 1000: 4
    padText('', 5),                                                      // 1001: 5 future
    padLeft(totalBkmvRecords, 15),                                       // 1002: 15
    padLeft(vatId, 9),                                                   // 1003: 9
    padLeft(primaryId, 15),                                              // 1004: 15
    padText(BKMV_HDL, 8),                                                // 1005: 8
    padLeft(OPERATOR.tax_software_reg_number || '1', 8),                 // 1006: 8 (min 00000001)
    padText(OPERATOR.software_name, 20),                                 // 1007: 20
    padText(OPERATOR.software_version, 20),                              // 1008: 20
    padLeft(OPERATOR.manufacturer_vat_id || '0', 9),                     // 1009: 9
    padText(OPERATOR.manufacturer_name_ascii || OPERATOR.manufacturer_name, 20), // 1010: 20
    padLeft(OPERATOR.software_type || '1', 1),                           // 1011: 1
    padText('', 50),                                                     // 1012: 50 path
    padLeft(OPERATOR.bookkeeping_type || '1', 1),                        // 1013: 1
    padLeft('0', 1),                                                     // 1014: 1
    padLeft(settings.company_registration_number || '0', 9),             // 1015: 9
    padLeft(settings.deduction_file_number || '0', 9),                   // 1016: 9
    padText('', 10),                                                     // 1017: 10 future
    padText(settings.business_name || '', 50),                           // 1018: 50
    padText(settings.business_address_street || '', 50),                 // 1019: 50
    padText(settings.business_address_number || '', 10),                 // 1020: 10
    padText(settings.business_address_city || '', 30),                   // 1021: 30
    padText(settings.business_address_postal || '', 8),                  // 1022: 8
    padLeft(new Date(dataRange.start + 'T00:00:00').getFullYear(), 4),   // 1023: 4 YYYY
    padLeft(dateYMD(dataRange.start + 'T00:00:00'), 8),                  // 1024: 8 YYYYMMDD
    padLeft(dateYMD(dataRange.end   + 'T00:00:00'), 8),                  // 1025: 8 YYYYMMDD
    padLeft(dateYMD(now), 8),                                            // 1026: 8 YYYYMMDD
    padLeft(timeHM(now), 4),                                             // 1027: 4 HHMM
    padLeft('0', 1),                                                     // 1028: 0=Hebrew
    padLeft('1', 1),                                                     // 1029: 1=ISO-8859-8-i
    padText('ZIP', 20),                                                  // 1030: 20 compression sw (required)
    padText(OPERATOR.leading_currency || 'ILS', 3),                      // 1032: 3
    padLeft(settings.has_branches ? '1' : '0', 1),                      // 1034: 1
    padText('', 46),                                                     // 1035: 46 future
  ]
  const rec = parts.join('')
  // Expected total: 4+5+15+9+15+8+8+20+20+9+20+1+50+1+1+9+9+10+50+50+10+30+8+4+8+8+8+4+1+1+20+3+1+46 = 466
  if (rec.length !== 466) console.warn('[A000] length', rec.length, 'expected 466')
  return rec.slice(0, 466).padEnd(466, ' ')
}

// ── Record A100 — BKMVDATA opening — 95 chars ────────────────────
// pos  len  field
//   0    4  1100 'A100'
//   4    9  1101 record serial (always 1)
//  13    9  1102 VAT ID
//  22   15  1103 primary ID
//  37    8  1104 'BKMVHDL '
//  45   50  1105 future (spaces)
// Total: 95
function recordA100({ serial, vatId, primaryId }) {
  const parts = [
    'A100',
    padLeft(serial, 9),
    padLeft(vatId, 9),
    padLeft(primaryId, 15),
    padText(BKMV_HDL, 8),
    padText('', 50),
  ]
  return parts.join('').slice(0, 95).padEnd(95, ' ')
}

// ── Record Z900 — BKMVDATA closing — 110 chars ───────────────────
// pos  len  field
//   0    4  1150 'Z900'
//   4    9  1151 record serial (last)
//  13    9  1152 VAT ID
//  22   15  1153 primary ID
//  37    8  1154 'BKMVHDL '
//  45   15  1155 total records in file (incl. A100 and Z900)
//  60   50  1156 future (spaces)
// Total: 110
function recordZ900({ serial, vatId, primaryId, totalRecords }) {
  const parts = [
    'Z900',
    padLeft(serial, 9),
    padLeft(vatId, 9),
    padLeft(primaryId, 15),
    padText(BKMV_HDL, 8),
    padLeft(totalRecords, 15),
    padText('', 50),
  ]
  return parts.join('').slice(0, 110).padEnd(110, ' ')
}

// ── Record C100 — Document header — 444 chars ────────────────────
// NOTE: C100 does NOT contain primaryId or BKMVHDL after vatId.
// pos  len  field
//   0    4  1200 'C100'
//   4    9  1201 serial
//  13    9  1202 VAT ID
//  22    3  1203 doc type
//  25   20  1204 doc number (str)
//  45    8  1205 doc date DDMMYYYY
//  53    4  1206 doc time HHMM
//  57   50  1207 customer name
// 107   50  1208 customer street
// 157   10  1209 customer house no
// 167   30  1210 customer city
// 197    8  1211 customer postal
// 205   30  1212 customer country
// 235    2  1213 country code (IL)
// 237   15  1214 customer phone
// 252    9  1215 customer VAT ID
// 261    8  1216 value date DDMMYYYY
// 269   15  1217 FC amount
// 284    3  1218 FC currency code
// 287   15  1219 amount before discount ⚠ must = sum(D110.1267)
// 302   15  1220 discount
// 317   15  1221 after discount before VAT
// 332   15  1222 VAT amount
// 347   15  1223 total with VAT ⚠ must = sum(D120.1312)
// 362   12  1224 withholding tax
// 374   15  1225 customer key
// 389   10  1226 match field
// 399    1  1228 cancelled: 'X' or ' '
// 400    8  1230 doc generation date DDMMYYYY
// 408    7  1231 branch ID
// 415    9  1233 operator ID
// 424    7  1234 link to line
// 431   13  1235 future
// Total: 444
function recordC100({
  serial, vatId, docType, docNumber, docDate,
  customerName, customerVatId, customerPhone,
  beforeVat, vatAmount, total, currency = 'ILS',
  isCancelled, generationDate, userId,
}) {
  const docYMD = dateYMD(docDate)
  const genYMD = dateYMD(generationDate || docDate)
  const parts = [
    'C100',                                    // 1200: 4
    padLeft(serial, 9),                        // 1201: 9
    padLeft(vatId, 9),                         // 1202: 9
    padLeft(docType, 3),                       // 1203: 3
    padText(docNumber, 20),                    // 1204: 20
    padLeft(docYMD, 8),                        // 1205: 8 YYYYMMDD
    padLeft(timeHM(docDate), 4),               // 1206: 4
    padText(customerName || '', 50),           // 1207: 50
    padText('', 50),                           // 1208: 50
    padText('', 10),                           // 1209: 10
    padText('', 30),                           // 1210: 30
    padText('', 8),                            // 1211: 8
    padText('', 30),                           // 1212: 30
    padText('IL', 2),                          // 1213: 2
    padText(customerPhone || '', 15),          // 1214: 15
    padLeft(customerVatId || '0', 9),          // 1215: 9
    padLeft(docYMD, 8),                        // 1216: 8 value date YYYYMMDD
    signedField(0, 13, 1),                     // 1217: 15 FC amount
    padText(currency, 3),                      // 1218: 3
    signedField(beforeVat, 13, 1),             // 1219: 15 ⚠
    signedField(0, 13, 1, true),               // 1220: 15 discount (always '-')
    signedField(beforeVat, 13, 1),             // 1221: 15 after discount before VAT
    signedField(vatAmount, 13, 1),             // 1222: 15 VAT
    signedField(total, 13, 1),                 // 1223: 15 ⚠
    signedField(0, 10, 1),                     // 1224: 12 withholding
    padLeft(customerVatId || '1', 15),         // 1225: 15 customer key
    padText('', 10),                           // 1226: 10
    padText(isCancelled ? 'X' : ' ', 1),       // 1228: 1
    padLeft(genYMD, 8),                        // 1230: 8 YYYYMMDD
    padText('', 7),                            // 1231: 7
    padText(userId || '', 9),                  // 1233: 9
    padLeft('0', 7),                           // 1234: 7
    padText('', 13),                           // 1235: 13
  ]
  return parts.join('').slice(0, 444).padEnd(444, ' ')
}

// ── Record D110 — Document line item — 339 chars ─────────────────
// NOTE: D110 does NOT contain primaryId or BKMVHDL after vatId.
// pos  len  field
//   0    4  1250 'D110'
//   4    9  1251 serial
//  13    9  1252 VAT ID
//  22    3  1253 doc type
//  25   20  1254 doc number (str)
//  45    4  1255 line number (0001...)
//  49    3  1256 base doc type (0=none)
//  52   20  1257 base doc number
//  72    1  1258 transaction type: 1=taxable, 2=exempt
//  73   20  1259 item code (str)
//  93   30  1260 description (str)
// 123   50  1261 manufacturer name
// 173   30  1262 product serial
// 203   20  1263 unit of measure
// 223   17  1264 quantity (13 int + 4 dec = 17, qty=1→00000000000010000)
// 240   15  1265 unit price excl VAT
// 255   15  1266 line discount
// 270   15  1267 line total ⚠ sum must = C100.1219
// 285    4  1268 VAT rate * 100 (1800 = 18%)
// 289    7  1270 branch ID
// 296    8  1272 doc date DDMMYYYY
// 304    7  1273 link to C100 header
// 311    7  1274 branch for base doc
// 318   21  1275 future
// Total: 339
function recordD110({
  serial, vatId, docType, docNumber, docDate,
  lineNum, itemCode, itemDescription,
  quantity, unitPrice, discount, lineTotal, vatRate,
}) {
  const parts = [
    'D110',                                            // 1250: 4
    padLeft(serial, 9),                                // 1251: 9
    padLeft(vatId, 9),                                 // 1252: 9
    padLeft(docType, 3),                               // 1253: 3
    padText(docNumber, 20),                            // 1254: 20
    padLeft(lineNum, 4),                               // 1255: 4
    padLeft('0', 3),                                   // 1256: 3 base doc type
    padText('', 20),                                   // 1257: 20 base doc number
    padLeft(Number(vatRate) > 0 ? '1' : '2', 1),      // 1258: 1 taxable/exempt
    padText(itemCode || '', 20),                       // 1259: 20
    padText(toAscii(itemDescription || '').trim() || 'Service', 30), // 1260: 30
    padText('', 50),                                   // 1261: 50 mfr name
    padText('', 30),                                   // 1262: 30 product serial
    padText('', 20),                                   // 1263: 20 unit
    signedField(quantity, 12, 4),                      // 1264: 17 qty (qty=1→+0000000000010000)
    signedField(unitPrice, 13, 1),                     // 1265: 15 unit price (+)
    signedField(discount || 0, 13, 1, true),           // 1266: 15 discount (always '-')
    signedField(lineTotal, 13, 1),                     // 1267: 15 ⚠ (+)
    padLeft(Math.round(Number(vatRate || 0) * 100), 4),// 1268: 4 e.g. 1800
    padText('', 7),                                    // 1270: 7 branch
    padLeft(dateYMD(docDate), 8),                      // 1272: 8 YYYYMMDD
    padLeft('0', 7),                                   // 1273: 7 link to C100
    padText('', 7),                                    // 1274: 7
    padText('', 21),                                   // 1275: 21 future
  ]
  return parts.join('').slice(0, 339).padEnd(339, ' ')
}

// ── Record D120 — Payment line — 222 chars ───────────────────────
// NOTE: D120 does NOT contain primaryId or BKMVHDL after vatId.
// pos  len  field
//   0    4  1300 'D120'
//   4    9  1301 serial
//  13    9  1302 VAT ID
//  22    3  1303 doc type
//  25   20  1304 doc number (str)
//  45    4  1305 line number
//  49    1  1306 payment method: 1=cash,2=check,3=credit,4=bank,5=voucher,9=other
//  50   10  1307 bank number
//  60   10  1308 branch number
//  70   15  1309 account number
//  85   10  1310 check number
//  95    8  1311 payment date DDMMYYYY
// 103   15  1312 amount ⚠ sum must = C100.1223
// 118    1  1313 card company code
// 119   20  1314 card name
// 139    1  1315 credit type
// 140    7  1320 branch ID
// 147    8  1322 doc date DDMMYYYY
// 155    7  1323 link to C100 header
// 162   60  1324 future
// Total: 222
function recordD120({
  serial, vatId, docType, docNumber, docDate,
  lineNum, paymentMethod, bankCode, branchCode, accountNumber,
  checkNumber, paymentDate, amount, cardType,
}) {
  const code = typeof paymentMethod === 'number'
    ? paymentMethod
    : (PAYMENT_CODE[paymentMethod] || PAYMENT_CODE.other)
  const parts = [
    'D120',                                        // 1300: 4
    padLeft(serial, 9),                            // 1301: 9
    padLeft(vatId, 9),                             // 1302: 9
    padLeft(docType, 3),                           // 1303: 3
    padText(docNumber, 20),                        // 1304: 20
    padLeft(lineNum, 4),                           // 1305: 4
    padLeft(code, 1),                                       // 1306: 1
    padLeft(code === 2 ? (bankCode || '12')    : '0', 10), // 1307: 10 (check only)
    padLeft(code === 2 ? (branchCode || '100') : '0', 10), // 1308: 10
    padLeft(code === 2 ? (accountNumber || '123456789012345') : '0', 15), // 1309: 15
    padLeft(code === 2 ? (checkNumber || '1')  : '0', 10), // 1310: 10
    padLeft(dateYMD(paymentDate || docDate), 8),   // 1311: 8 YYYYMMDD
    signedField(amount, 13, 1),                    // 1312: 15 ⚠ (+)
    padLeft('0', 1),                               // 1313: 1
    padText(cardType || '', 20),                   // 1314: 20
    padLeft('0', 1),                               // 1315: 1
    padText('', 7),                                // 1320: 7
    padLeft(dateYMD(docDate), 8),                  // 1322: 8 YYYYMMDD
    padLeft('0', 7),                               // 1323: 7
    padText('', 60),                               // 1324: 60 future
  ]
  return parts.join('').slice(0, 222).padEnd(222, ' ')
}

// ── Record B110 — Chart of accounts — 376 chars ─────────────────────
// pos  len  field
//   0    4  1400 'B110'
//   4    9  1401 serial
//  13    9  1402 VAT ID
//  22   15  1403 account key (str)
//  37   50  1404 account name (str)
//  87   15  1405 trial balance code (str)
// 102   30  1406 trial balance desc (str)
// 132   50  1407 street (str)
// 182   10  1408 house no (str)
// 192   30  1409 city (str)
// 222    8  1410 postal (str)
// 230   30  1411 country (str)
// 260    2  1412 country code (str)
// 262   15  1413 parent account (str)
// 277   15  1414 opening balance (num)
// 292   15  1415 total debit (num)
// 307   15  1416 total credit (num)
// 322    4  1417 classification code (num)
// 326    9  1419 customer/supplier VAT (num)
// 335    7  1421 branch (str)
// 342   15  1422 FC balance (num)
// 357    3  1423 currency code (str)
// 360   16  1424 future (str)
// Total: 376
function recordB110({ serial, vatId, accountKey, accountName }) {
  const parts = [
    'B110',                         // 1400: 4
    padLeft(serial, 9),             // 1401: 9
    padLeft(vatId, 9),              // 1402: 9
    padText(accountKey || '', 15),  // 1403: 15
    padText(accountName || '', 50), // 1404: 50
    padText('1000', 15),            // 1405: 15 trial balance code (mandatory, non-empty)
    padText('Revenue', 30),        // 1406: 30 trial balance desc (mandatory, non-empty)
    padText('', 50),                // 1407: 50
    padText('', 10),                // 1408: 10
    padText('', 30),                // 1409: 30
    padText('', 8),                 // 1410: 8
    padText('', 30),                // 1411: 30
    padText('', 2),                 // 1412: 2
    padText('', 15),                // 1413: 15
    signedField(0, 13, 1),          // 1414: 15 opening balance (+/-)
    signedField(0, 13, 1),          // 1415: 15 total debit (+)
    signedField(0, 13, 1),          // 1416: 15 total credit (+)
    padLeft('0', 4),                // 1417: 4
    padLeft('0', 9),                // 1419: 9
    padText('', 7),                 // 1421: 7
    signedField(0, 13, 1),          // 1422: 15 FC balance (+/-)
    padText('ILS', 3),              // 1423: 3
    padText('', 16),                // 1424: 16
  ]
  // 4+9+9+15+50+15+30+50+10+30+8+30+2+15+15+15+15+4+9+7+15+3+16 = 376
  return parts.join('').slice(0, 376).padEnd(376, ' ')
}

// ── Record M100 — Inventory/Item master — 298 chars ───────────────
// NOTE: M100 does NOT contain primaryId or BKMVHDL after vatId.
function recordM100({
  serial, vatId, itemCode, itemDescription,
  unit, unitPrice,
}) {
  const code = itemCode ? itemCode.replace(/[^\x00-\x7F]/g, '').trim() || 'SERVICE001' : 'SERVICE001'
  const parts = [
    'M100',                                    // 4
    padLeft(serial, 9),                        // 9
    padLeft(vatId, 9),                         // 9 → pos 22
    padText(code, 20),                         // 20 item code (field 1455)
    padText('', 20),                           // 20 supplier code
    padText(itemDescription || 'Service', 50), // 50 description
    padText('', 15),                           // 15 classification
    padText(unit || '', 20),                   // 20 unit
    numField(0, 14, 3),                        // 17 opening qty    (field 1460)
    numField(0, 13, 2),                        // 15 opening value  (field 1461)
    numField(unitPrice || 0, 13, 2),           // 15 cost price     (field 1462)
    numField(unitPrice || 0, 13, 2),           // 15 sale price     (field 1463)
    padText('', 50),                           // 50 mfr name
    padText('', 39),                           // 39 future (36 + 3 freed from removed currency)
  ]
  // 4+9+9+20+20+50+15+20+17+15+15+15+50+39 = 298
  return parts.join('').slice(0, 298).padEnd(298, ' ')
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
  const counts = { B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 1 }
  // docTypeSummary: { '320': { count, total }, '330': { count, total }, ... }
  const docTypeSummary = {}

  // A100 — first record in BKMVDATA.TXT per spec §6
  lines.push(recordA100({ serial: serial++, vatId, primaryId }))

  // B110 — one dummy revenue account (simulator requires chart of accounts)
  lines.push(recordB110({ serial: serial++, vatId, accountKey: '1000', accountName: 'Revenue' }))
  counts.B110++

  invoices.forEach((inv) => {
    const docType = inv.is_credit_note
      ? (businessType === 'osek_patur' ? '405' : '330')
      : (businessType === 'osek_patur' ? '400' : '320')
    const beforeVat = Number(inv.amount_before_vat || inv.total_amount || 0)
    const vatAmount = Number(inv.vat_amount || 0)
    const total     = Number(inv.total_amount || 0)
    const vatRate   = Number(inv.vat_rate || 18)

    lines.push(recordC100({
      serial: serial++, vatId, docType,
      docNumber: inv.invoice_number,
      docDate:   inv.service_date || inv.created_at,
      customerName:  inv.customer_name,
      customerVatId: inv.customer_tax_id,
      customerPhone: inv.customer_phone,
      beforeVat, vatAmount, total,
      isCancelled:    inv.is_cancelled,
      generationDate: inv.created_at,
      userId:         inv.created_by,
    }))
    counts.C100++
    if (!docTypeSummary[docType]) docTypeSummary[docType] = { count: 0, total: 0 }
    docTypeSummary[docType].count++
    docTypeSummary[docType].total += total

    const lineItems = inv.invoice_items && inv.invoice_items.length > 0
      ? inv.invoice_items
      : [{ service_id: inv.service_id, name: inv.service_name || 'Service', quantity: 1, unit_price: beforeVat, line_total: beforeVat }]

    lineItems.forEach((item, idx) => {
      lines.push(recordD110({
        serial: serial++, vatId, docType,
        docNumber: inv.invoice_number,
        docDate:   inv.service_date || inv.created_at,
        lineNum:   idx + 1,
        itemCode:  (item.service_id || item.product_id || inv.service_id || 'SVC').toString().slice(0, 20),
        itemDescription: item.name || inv.service_name || 'Service',
        quantity:  Number(item.quantity || 1),
        unitPrice: Number(item.unit_price || beforeVat),
        discount:  0,
        lineTotal: Number(item.line_total || beforeVat),
        vatRate,
      }))
      counts.D110++
    })

    // Credit notes (330/405) never get a D120 — simulator rejects D120 for credit doc types
    if (!inv.is_credit_note && (inv.status === 'paid' || inv.paid_at)) {
      lines.push(recordD120({
        serial: serial++, vatId, docType,
        docNumber: inv.invoice_number,
        docDate:   inv.service_date || inv.created_at,
        lineNum:   1,
        paymentMethod: inv.payment_method || 'cash',
        paymentDate:   inv.paid_at || inv.created_at,
        amount: total,
      }))
      counts.D120++
    }
  })

  // M100 (inventory) is optional per spec and omitted — service-based businesses don't require it

  const totalSoFar = serial - 1
  lines.push(recordZ900({
    serial, vatId, primaryId,
    totalRecords: totalSoFar + 1,
  }))

  return { text: lines.join(CRLF) + CRLF, counts, docTypeSummary }
}

// ── Build INI.TXT — A000 + summary records (19 chars each) per spec §5 ──────
// Summary record format: 4-char type code + 15-digit zero-padded count = 19 chars
export function buildIni({ vatId, primaryId, settings, from, to, counts }) {
  const totalBkmv = 1 + (counts.B110 || 0) + counts.C100 + counts.D110 + counts.D120 + counts.M100 + 1

  const a000 = recordA000({
    primaryId,
    totalBkmvRecords: totalBkmv,
    vatId,
    settings,
    dataRange: { start: from, end: to },
  })

  const lines = [a000]
  for (const type of ['B110', 'C100', 'D110', 'D120', 'M100']) {
    const cnt = counts[type] || 0
    if (cnt > 0) {
      lines.push(type + padLeft(cnt, 15)) // 4 + 15 = 19 chars
    }
  }

  return lines.join(CRLF) + CRLF
}

// ── Section 2.6 report ───────────────────────────────────────────
// All document-type codes defined in OPENFRMT 1.31
const DOC_TYPE_LABELS = {
  '100': 'הזמנה', '200': 'תעודת משלוח', '205': 'תעודת משלוח סוכן',
  '210': 'תעודת החזרה', '300': 'חשבונית/חשבונית עסקה', '305': 'חשבונית-מס',
  '310': 'חשבונית ריכוז', '320': 'חשבונית מס / קבלה', '330': 'חשבונית מס זיכוי',
  '340': 'חשבונית שריון', '345': 'חשבונית סוכן', '400': 'קבלה',
  '405': 'קבלה על תרומות', '406': 'קבלה על פקדון', '410': 'יציאה מקופה',
  '420': 'הפקדת בנק', '500': 'הזמנת רכש', '600': 'תעודת משלוח רכש',
  '610': 'החזרת רכש', '700': 'חשבונית מס רכש', '710': 'זיכוי רכש',
  '800': 'יתרת פתיחה', '810': 'כניסה כללית למלאי', '820': 'יציאה כללית מהמלאי',
  '830': 'העברה בין מחסנים', '840': 'עדכון בעקבות ספירה', '900': 'דוח ייצור-כניסה',
  '910': 'דוח ייצור-יציאה',
}

export function buildSection26Report({ settings, from, to, counts, docTypeSummary, primaryId }) {
  return {
    businessName:    settings.business_name || '',
    vatId:           settings.business_tax_id || '',
    softwareReg:     OPERATOR.tax_software_reg_number || '',
    softwareName:    `${OPERATOR.software_name} ${OPERATOR.software_version}`,
    primaryId,
    dataRange:       { from, to },
    generatedAt:     new Date().toISOString(),
    docTypeSummary:  docTypeSummary || {},
    counts,
    ofVersion:       BKMV_HDL.trim(),
  }
}

function buildSection26Html(report) {
  const now = new Date(report.generatedAt)
  const dateStr = now.toLocaleDateString('he-IL')
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const allCodes = Object.keys(DOC_TYPE_LABELS)
  let totalCount = 0, totalAmount = 0
  const rows = allCodes.map(code => {
    const s = report.docTypeSummary[code] || { count: 0, total: 0 }
    totalCount  += s.count
    totalAmount += s.total
    return `<tr><td>${code}</td><td>${DOC_TYPE_LABELS[code]}</td><td>${s.count || 0}</td><td>${s.total ? s.total.toLocaleString('he-IL', { minimumFractionDigits: 2 }) : '0'}</td></tr>`
  }).join('\n')
  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head>
<meta charset="UTF-8">
<title>דוח הפקת קובץ אחיד — סעיף 2.6</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:30px;max-width:820px;margin:auto;font-size:13px}
  h1{font-size:20px;text-align:center;border-bottom:2px solid #000;padding-bottom:10px}
  h2{font-size:14px;margin-top:22px}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th,td{border:1px solid #888;padding:5px 8px;text-align:right}
  th{background:#e8e8e8;font-weight:bold}
  .meta td:first-child{font-weight:bold;background:#f5f5f5;width:200px}
  .total-row{font-weight:bold;background:#f0f0f0}
  .footer{margin-top:30px;font-size:12px}
  @media print{.noprint{display:none}}
</style></head><body>
<h1>הפקת קבצים במבנה אחיד</h1>
<table class="meta">
  <tr><td>עבור</td><td>${report.businessName}</td></tr>
  <tr><td>מספר עוסק מורשה</td><td>${report.vatId}</td></tr>
  <tr><td>טווח תאריכים</td><td>מתאריך: ${report.dataRange.from} &nbsp;&nbsp; ועד תאריך: ${report.dataRange.to}</td></tr>
</table>
<h2>פירוט סוגי המסמכים</h2>
<table>
  <tr><th>מספר מסמך</th><th>סוג המסמך</th><th>סה"כ כמותי</th><th>סה"כ כספי (בש"ח)</th></tr>
  ${rows}
  <tr class="total-row"><td colspan="2">סה"כ</td><td>${totalCount}</td><td>${totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td></tr>
</table>
<p class="footer">
  הנתונים הופקו באמצעות תוכנת <strong>${report.softwareName}</strong>,
  מספר תעודת הרישום: <strong>${report.softwareReg || '________'}</strong>
  &nbsp;&nbsp;&nbsp; בתאריך: ${dateStr} &nbsp;&nbsp; בשעה: ${timeStr}
</p>
<button class="noprint" onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:14px;cursor:pointer">🖨 הדפס</button>
</body></html>`
}

export function printSection26(report) {
  const w = window.open('', '_blank')
  w.document.write(buildSection26Html(report))
  w.document.close()
}

// ── Registration package — Documents B + C ───────────────────────
// Prints two HTML windows for software registration submission:
//   Document B: Section 2.6 printout (correct format per official spec)
//   Document C: Appendix 5.4 — printable screenshot of the export interface
export function printRegistrationPackage({ counts, docTypeSummary, primaryId, dirPrefix, totalRecords }) {
  const now = new Date().toLocaleString('he-IL')
  const vatId   = '123456782'
  const swName  = `${OPERATOR.software_name} ${OPERATOR.software_version}`
  const swReg   = OPERATOR.tax_software_reg_number || '00000001'
  const mfr     = OPERATOR.manufacturer_name_ascii || OPERATOR.manufacturer_name
  const mfrVat  = OPERATOR.manufacturer_vat_id

  // Open both windows immediately in same call stack to avoid popup blocker
  const wB = window.open('', '_blank')
  const wC2 = window.open('', '_blank')

  // ── Document B: Section 2.6 ───────────────────────────────────────
  const demoSettings = {
    business_name: 'עסק לדוגמה בע"מ',
    business_tax_id: vatId,
  }
  const report26 = buildSection26Report({
    settings: demoSettings,
    from: '2024-01-01',
    to:   '2024-12-31',
    counts,
    docTypeSummary: docTypeSummary || {},
    primaryId,
  })
  wB.document.write(buildSection26Html(report26))
  wB.document.close()

  // ── Document C: Appendix 5.4 — post-export success screen ────────
  const nowDate = new Date()
  const dateStr54 = nowDate.toLocaleDateString('he-IL')
  const timeStr54 = nowDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const pathStr = dirPrefix.replace(/\//g, '\\')
  const totalAll = 1 + (counts.B110||1) + counts.C100 + counts.D110 + counts.D120 + (counts.M100||0) + 1

  const docC = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="UTF-8">
<title>נספח 5.4 — הפקת קבצים במבנה אחיד</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:40px;max-width:700px;margin:auto;font-size:14px}
  h1{font-size:18px;text-align:center;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #888;padding:6px 10px;text-align:right}
  th{background:#e8e8e8;font-weight:bold}
  .meta td:first-child{font-weight:bold;width:200px}
  .success{font-weight:bold;text-align:center;margin:16px 0;font-size:15px}
  .total-row{font-weight:bold;background:#f0f0f0}
  .footer{margin-top:24px;font-size:13px}
  @media print{.noprint{display:none}}
</style></head><body>
<h1>הפקת קבצים במבנה אחיד</h1>

<table class="meta">
  <tr><td>עבור</td><td>עסק לדוגמה בע"מ</td></tr>
  <tr><td>מספר עוסק מורשה</td><td>${vatId}</td></tr>
  <tr><td>שם בית העסק</td><td>עסק לדוגמה בע"מ</td></tr>
</table>

<p class="success">** ביצוע ממשק פתוח הסתיים בהצלחה **</p>

<table class="meta">
  <tr><td>הנתונים נשמרו בנתיב</td><td>${pathStr}</td></tr>
  <tr><td>טווח תאריכים</td><td>מתאריך: 01/01/2024 &nbsp;&nbsp; ועד תאריך: 31/12/2024</td></tr>
</table>

<p style="margin-top:16px;font-weight:bold">פירוט סך סוגי הרשומות שנוצרו בקובץ BKMVDATA.TXT:</p>
<table>
  <tr><th>סוג רשומה</th><th>תיאור</th><th>כמות</th></tr>
  <tr><td>A100</td><td>רשומת פתיחה</td><td>1</td></tr>
  <tr><td>B110</td><td>חשבון בהנהלת חשבונות</td><td>${counts.B110||1}</td></tr>
  <tr><td>C100</td><td>כותרת מסמך</td><td>${counts.C100}</td></tr>
  <tr><td>D110</td><td>פרטי מסמך</td><td>${counts.D110}</td></tr>
  <tr><td>D120</td><td>פרטי קבלה</td><td>${counts.D120}</td></tr>
  <tr><td>M100</td><td>פריטים במלאי</td><td>${counts.M100||0}</td></tr>
  <tr><td>Z900</td><td>רשומת סיום</td><td>1</td></tr>
  <tr class="total-row"><td colspan="2">סה"כ</td><td>${totalAll}</td></tr>
</table>

<p class="footer">
  הנתונים הופקו באמצעות תוכנת <strong>${swName}</strong>,
  מספר תעודת הרישום: <strong>${swReg}</strong><br>
  בתאריך: ${dateStr54} &nbsp;&nbsp; בשעה: ${timeStr54}
</p>

<button class="noprint" onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:14px;cursor:pointer">🖨 הדפס</button>
</body></html>`

  wC2.document.write(docC)
  wC2.document.close()
}

// ── Settings validation ──────────────────────────────────────────
const REQUIRED_SETTINGS_FIELDS = [
  ['business_tax_id',         'מס׳ עוסק מורשה'],
  ['business_name',           'שם העסק'],
  ['business_address_street', 'כתובת — רחוב'],
  ['business_address_city',   'כתובת — עיר'],
]

export function validateOpenFormatSettings(settings) {
  const errors = []
  const warnings = []

  for (const [key, label] of REQUIRED_SETTINGS_FIELDS) {
    if (!settings[key] || String(settings[key]).trim() === '') {
      errors.push(`חסר שדה חובה: ${label}`)
    }
  }

  if (!OPERATOR.manufacturer_vat_id) errors.push('חסר ת.ז/ח.פ יצרן התוכנה (operator.js)')
  if (!OPERATOR.manufacturer_name)   errors.push('חסר שם יצרן התוכנה (operator.js)')
  if (!OPERATOR.tax_software_reg_number) {
    warnings.push('מספר רישום תוכנה עדיין לא הוזן ב-operator.js — הקובץ יכלול "0" ולא יתקבל ברשות המיסים.')
  } else if (!/^\d{8}$/.test(OPERATOR.tax_software_reg_number)) {
    errors.push('מס׳ רישום תוכנה ב-operator.js חייב להיות 8 ספרות.')
  }

  if (!settings.tax_office_notified) {
    warnings.push('לא סומן "עודכנה רשות המיסים".')
  }
  if (settings.business_tax_id && !/^\d{9}$/.test(String(settings.business_tax_id).replace(/\D/g, ''))) {
    errors.push('מס׳ עוסק חייב להיות 9 ספרות.')
  }
  return { valid: errors.length === 0, errors, warnings }
}

// ── Main entry — generate ZIP ────────────────────────────────────
export async function generateOpenFormatZip({ from, to, settings }) {
  const validation = validateOpenFormatSettings(settings)
  if (!validation.valid) {
    throw new Error('הגדרות חסרות:\n' + validation.errors.join('\n'))
  }

  const vatId       = String(settings.business_tax_id).replace(/\D/g, '').padStart(9, '0')
  const primaryId   = randomPrimaryId15()
  const businessType = settings.business_type || 'osek_morsheh'

  const { invoices, services } = await fetchDataset({ from, to })
  const { text: bkmvText, counts, docTypeSummary } = buildBkmvdata({ vatId, primaryId, invoices, services, businessType })
  const iniText = buildIni({ vatId, primaryId, settings, from, to, counts })

  const inner = new JSZip()
  inner.file('BKMVDATA.TXT', bkmvText)
  const innerBlob = await inner.generateAsync({ type: 'uint8array' })

  const now = new Date()
  const MMDDhhmm = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const yy = String(now.getFullYear()).slice(-2)
  const dirPrefix = `OPENFRMT/${vatId}.${yy}/${MMDDhhmm}/`

  const outer = new JSZip()
  outer.file(dirPrefix + 'INI.TXT', iniText)
  outer.file(dirPrefix + 'BKMVDATA.zip', innerBlob)

  const report = buildSection26Report({ settings, from, to, counts, docTypeSummary, primaryId })
  outer.file(dirPrefix + 'SECTION_2_6_REPORT.json', JSON.stringify(report, null, 2))

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
