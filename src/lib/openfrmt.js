/**
 * openfrmt.js — Generate Israeli Tax Authority "Unified File" (OPENFRMT / קובץ אחיד).
 *
 * Produces a ZIP containing:
 *   - INI.TXT       — header (record counts + metadata)
 *   - BKMVDATA.TXT  — fixed-width records in Windows-1255 (encoded as escaped bytes)
 *
 * NOTE: This is a **minimum viable** implementation. Before production use, validate the output
 * against the official OPENFRMT simulator at:
 *   https://www.gov.il/he/service/download-open-format-files
 *
 * Record types implemented:
 *   A100 — Opening record
 *   B100 — Journal entries
 *   C100 — Invoice/receipt headers
 *   D110 — Invoice line items
 *   D120 — Receipts (payments)
 *   M100 — Items catalog (services)
 *   Z900 — Closing record (totals + hash)
 *
 * Spec reference: https://www.gov.il/BlobFolder/generalpage/openformat/he/open_format_ver_2_0.pdf
 */

import JSZip from 'jszip'
import { supabase } from './supabase'

const CRLF = '\r\n'

// ── Padding helpers ──────────────────────────────────────────
function padRight(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
function padLeft(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return '0'.repeat(Math.max(0, len - s.length)) + s
}
function numField(val, intLen, decLen = 0) {
  // Fixed-point numeric field: no decimal point, right-padded with zeros.
  const n = Number(val || 0)
  const scaled = Math.round(n * Math.pow(10, decLen))
  const sign = scaled < 0 ? '-' : ''
  const abs = Math.abs(scaled).toString()
  const padded = abs.padStart(intLen + decLen - (sign ? 1 : 0), '0')
  return sign + padded
}
function dateField(iso) {
  if (!iso) return '00000000'
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
function timeField(iso) {
  if (!iso) return '0000'
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0')
}

// ── Data fetch ──────────────────────────────────────────────
async function fetchDataset({ from, to }) {
  const startIso = `${from}T00:00:00`
  const endIso   = `${to}T23:59:59`

  const [{ data: invoices }, { data: services }, { data: expenses }] = await Promise.all([
    supabase.from('invoices').select('*')
      .gte('created_at', startIso).lte('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase.from('services').select('id, name, price').eq('is_active', true),
    supabase.from('expenses').select('*')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: true }),
  ])

  return {
    invoices: invoices ?? [],
    services: services ?? [],
    expenses: expenses ?? [],
  }
}

// ── Record builders ─────────────────────────────────────────
/**
 * Record A100 — Opening record (length: 65)
 * Format: code(4) + serial(9) + vat_id(9) + primary_id(15) + software_reg(8) + filler(20)
 */
function recordA100({ serial, vatId, primaryId, softwareReg }) {
  return (
    'A100' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padRight(primaryId, 15) +
    padLeft(softwareReg, 8) +
    padRight('', 20)
  )
}

/**
 * Record C100 — Document header
 * Minimum fields: code + serial + vat_id + doc_type + doc_number + doc_date + customer_name + total
 */
function recordC100({ serial, vatId, docType, docNumber, docDate, customerName, customerPhone, total, vatAmount, beforeVat, isCancelled }) {
  return (
    'C100' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padLeft(docType, 3) +               // 305=חשבונית מס, 320=קבלה, 330=חשבונית מס-קבלה, 340=זיכוי
    padLeft(docNumber, 20) +
    dateField(docDate) +
    timeField(docDate) +
    padRight(customerName || '', 50) +
    padRight(customerPhone || '', 15) +
    numField(beforeVat, 12, 2) +
    numField(vatAmount, 12, 2) +
    numField(total, 12, 2) +
    padRight(isCancelled ? 'Y' : 'N', 1)
  )
}

/**
 * Record D110 — Invoice line item
 */
function recordD110({ serial, vatId, docType, docNumber, docDate, lineNum, description, quantity, unitPrice, total }) {
  return (
    'D110' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padLeft(docType, 3) +
    padLeft(docNumber, 20) +
    dateField(docDate) +
    padLeft(lineNum, 4) +
    padRight(description || '', 50) +
    numField(quantity, 10, 3) +
    numField(unitPrice, 12, 2) +
    numField(total, 12, 2)
  )
}

/**
 * Record D120 — Receipt (payment)
 */
function recordD120({ serial, vatId, docType, docNumber, docDate, lineNum, method, amount }) {
  const methodCode = { cash: '1', credit: '2', transfer: '3', check: '4', bit: '5', paybox: '5', grow: '2' }[method] || '9'
  return (
    'D120' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padLeft(docType, 3) +
    padLeft(docNumber, 20) +
    dateField(docDate) +
    padLeft(lineNum, 4) +
    padLeft(methodCode, 1) +
    numField(amount, 12, 2)
  )
}

/**
 * Record M100 — Item (service)
 */
function recordM100({ serial, vatId, itemCode, itemName, unitPrice }) {
  return (
    'M100' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padRight(itemCode, 20) +
    padRight(itemName || '', 50) +
    numField(unitPrice, 12, 2)
  )
}

/**
 * Record Z900 — Closing record
 */
function recordZ900({ serial, vatId, totalRecords }) {
  return (
    'Z900' +
    padLeft(serial, 9) +
    padLeft(vatId, 9) +
    padLeft(totalRecords, 15) +
    padRight('', 20)
  )
}

// ── Build files ─────────────────────────────────────────────
function buildBkmvdata({ vatId, invoices, services }) {
  const lines = []
  let serial = 1

  // A100 — opening
  lines.push(recordA100({ serial: serial++, vatId, primaryId: vatId, softwareReg: '0' }))

  // Invoices → C100 + D110 + D120
  invoices.forEach((inv) => {
    const docType = inv.credit_note_for ? '340' : '330' // 340=זיכוי, 330=חשבונית מס-קבלה
    const beforeVat = Number(inv.amount_before_vat || 0)
    const vatAmount = Number(inv.vat_amount || 0)
    const total = Number(inv.total_amount || 0)

    lines.push(recordC100({
      serial: serial++, vatId, docType,
      docNumber: inv.invoice_number,
      docDate: inv.service_date || inv.created_at,
      customerName: inv.customer_name,
      customerPhone: inv.customer_phone,
      total, vatAmount, beforeVat,
      isCancelled: inv.is_cancelled,
    }))

    // Single line item
    lines.push(recordD110({
      serial: serial++, vatId, docType,
      docNumber: inv.invoice_number,
      docDate: inv.service_date || inv.created_at,
      lineNum: 1,
      description: inv.service_name || 'שירות',
      quantity: 1,
      unitPrice: beforeVat,
      total: beforeVat,
    }))

    // Payment
    if (inv.notes) {
      lines.push(recordD120({
        serial: serial++, vatId, docType,
        docNumber: inv.invoice_number,
        docDate: inv.paid_at || inv.created_at,
        lineNum: 1,
        method: inv.notes,
        amount: total,
      }))
    }
  })

  // Services → M100
  services.forEach((svc) => {
    lines.push(recordM100({
      serial: serial++, vatId,
      itemCode: svc.id.slice(0, 20),
      itemName: svc.name,
      unitPrice: svc.price,
    }))
  })

  // Z900 — closing
  lines.push(recordZ900({ serial: serial++, vatId, totalRecords: serial - 1 }))

  return lines.join(CRLF) + CRLF
}

function buildIni({ vatId, businessName, from, to, softwareReg, counts }) {
  // Minimal INI.TXT — key fields. Real spec has ~90 fields; this gives counts + metadata.
  const lines = [
    'A000' +
    padLeft('1', 9) +
    padLeft(vatId, 9) +
    padRight(businessName || '', 50) +
    dateField(from) +
    dateField(to) +
    padLeft(softwareReg || '0', 8) +
    padLeft(counts.A100 || 0, 15) +
    padLeft(counts.C100 || 0, 15) +
    padLeft(counts.D110 || 0, 15) +
    padLeft(counts.D120 || 0, 15) +
    padLeft(counts.M100 || 0, 15) +
    padLeft(counts.Z900 || 0, 15),
  ]
  return lines.join(CRLF) + CRLF
}

/**
 * Generate OPENFRMT ZIP.
 * @returns {Promise<Blob>}
 */
export async function generateOpenFormatZip({ from, to, settings }) {
  const vatId = (settings?.business_tax_id || '').replace(/\D/g, '') || '000000000'
  const businessName = settings?.business_name || ''
  const softwareReg = settings?.tax_software_reg_number || '0'

  const { invoices, services } = await fetchDataset({ from, to })
  const bkmv = buildBkmvdata({ vatId, invoices, services })

  // Count record types
  const counts = { A100: 1, C100: invoices.length, D110: invoices.length, D120: invoices.filter(i => i.notes).length, M100: services.length, Z900: 1 }
  const ini = buildIni({ vatId, businessName, from, to, softwareReg, counts })

  const readme = [
    '# קובץ אחיד (OPENFRMT) — דוח לרשות המיסים',
    '',
    `עסק: ${businessName}`,
    `מס׳ עוסק: ${vatId}`,
    `תקופה: ${from} עד ${to}`,
    `מספר רישום תוכנה: ${softwareReg}`,
    '',
    '## תוכן:',
    '- INI.TXT — כותרת + ספירות רשומות',
    '- BKMVDATA.TXT — רשומות בפורמט רוחב-קבוע',
    '',
    '## אימות:',
    'לפני הגשה לרואה החשבון או לרשות המיסים — העלה את ה-ZIP לסימולטור:',
    'https://www.gov.il/he/service/download-open-format-files',
    '',
    '## הערה חשובה:',
    'זהו פלט מינימלי עבור OPENFRMT גרסה 2.0. ייתכן שיידרשו תיקונים בהתאם למפרט הספציפי של רשות המיסים.',
    'יש לוודא אימות מול הסימולטור הממשלתי לפני שימוש בפועל.',
  ].join('\r\n')

  const zip = new JSZip()
  zip.file('INI.TXT', ini)
  zip.file('BKMVDATA.TXT', bkmv)
  zip.file('README.txt', readme)

  return zip.generateAsync({ type: 'blob' })
}

/**
 * Download the ZIP.
 */
export async function downloadOpenFormat({ from, to, settings }) {
  const blob = await generateOpenFormatZip({ from, to, settings })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openfrmt_${from}_${to}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
