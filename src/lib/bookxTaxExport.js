/**
 * bookxTaxExport.js — BOOKX SaaS tax export API.
 * Multi-tenant wrapper around openfrmt.js for the Israeli Tax Authority (רשות המסים).
 *
 * Public API:
 *   generateINI(tenantData, period)         — builds INI.TXT string (pure, no network)
 *   generateBKMV(tenantDocuments, period)   — builds BKMVDATA.TXT string (pure, no network)
 *   exportTaxFiles(tenantId, period)        — fetches + generates + downloads ZIP
 *   validateIntegrity({ invoices })         — validates D110/D120 sums vs C100
 *   generateSampleFiles(invoiceCount)       — 2000+ record demo ZIP for the simulator
 */

import JSZip from 'jszip'
import { supabase } from './supabase'
import { OPERATOR } from '../config/operator'
import {
  randomPrimaryId15,
  buildBkmvdata,
  buildIni,
  validateOpenFormatSettings,
  downloadOpenFormat,
  buildSection26Report,
  printSection26,
  generateOpenFormatZip,
} from './openfrmt'

// ── generateINI ──────────────────────────────────────────────────
// tenantData: business settings object (business_tax_id, business_name, ...)
// period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// returns: { text: string, primaryId: string }
export function generateINI(tenantData, period) {
  const vatId = String(tenantData.business_tax_id || '').replace(/\D/g, '').padStart(9, '0')
  const primaryId = randomPrimaryId15()
  const counts = { C100: 0, D110: 0, D120: 0, M100: 0 }
  const text = buildIni({ vatId, primaryId, settings: tenantData, from: period.from, to: period.to, counts })
  return { text, primaryId }
}

// ── generateBKMV ─────────────────────────────────────────────────
// tenantDocuments: { vatId, primaryId, invoices, services, businessType }
// returns: { text: string, counts: object }
export function generateBKMV(tenantDocuments) {
  const { invoices = [], services = [], businessType = 'osek_morsheh', vatId, primaryId } = tenantDocuments
  return buildBkmvdata({ vatId, primaryId, invoices, services, businessType })
}

// ── validateIntegrity ────────────────────────────────────────────
// Validates two ledger rules before export:
//   Rule 1: sum(D110.line_total) per document == C100.amount_before_vat
//   Rule 2: for paid invoices, total_amount > 0 (D120 will have a value)
export function validateIntegrity({ invoices = [] }) {
  const errors = []
  for (const inv of invoices) {
    const beforeVat = Number(inv.amount_before_vat ?? inv.total_amount ?? 0)
    const total = Number(inv.total_amount ?? 0)
    const items = inv.invoice_items ?? []

    if (items.length > 0) {
      const d110Sum = items.reduce((s, it) => s + Number(it.line_total ?? 0), 0)
      if (Math.abs(d110Sum - beforeVat) > 0.02) {
        errors.push(
          `חשבונית ${inv.invoice_number}: סכום שורות D110 (${d110Sum.toFixed(2)}) ≠ סכום ראשי C100 (${beforeVat.toFixed(2)})`
        )
      }
    }

    if ((inv.status === 'paid' || inv.paid_at) && total <= 0) {
      errors.push(`חשבונית ${inv.invoice_number}: חשבונית ששולמה עם סכום D120 = 0`)
    }
  }
  return { valid: errors.length === 0, errors }
}

// ── exportTaxFiles ───────────────────────────────────────────────
// tenantId: business_tax_id (9-digit string) — used for path + tenant isolation
// period: { from, to }
// options: { skipIntegrityCheck: bool }
export async function exportTaxFiles(tenantId, period, options = {}) {
  const { from, to } = period

  const { data: settingsRow } = await supabase.from('business_settings').select('*').single()
  if (!settingsRow) throw new Error('לא נמצאו הגדרות עסק')

  const vatId = String(settingsRow.business_tax_id || '').replace(/\D/g, '')
  if (tenantId && tenantId !== vatId) {
    throw new Error('שגיאת אבטחה: מספר העוסק לא תואם את הגדרות המערכת')
  }

  const { valid, errors } = validateOpenFormatSettings(settingsRow)
  if (!valid) throw new Error('הגדרות חסרות:\n' + errors.join('\n'))

  if (!options.skipIntegrityCheck) {
    const { data: invoices } = await supabase
      .from('invoices').select('*, invoice_items(*)')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)

    const integrity = validateIntegrity({ invoices: invoices ?? [] })
    if (!integrity.valid) throw new Error('שגיאות אינטגריטי:\n' + integrity.errors.join('\n'))
  }

  return downloadOpenFormat({ from, to, settings: settingsRow })
}

// ── generateSampleFiles ──────────────────────────────────────────
// Generates a demo ZIP with 2,000+ BKMVDATA records for the tax authority simulator.
// No Supabase access — all data is fabricated.
const SAMPLE_SERVICES = [
  { id: 'svc-001', name: 'תספורת',    price: 80  },
  { id: 'svc-002', name: 'צביעה',     price: 200 },
  { id: 'svc-003', name: 'עיצוב זקן', price: 60  },
  { id: 'svc-004', name: 'טיפול שיער', price: 150 },
  { id: 'svc-005', name: 'פן',        price: 120 },
]

function makeSampleInvoice(i) {
  const svc  = SAMPLE_SERVICES[i % SAMPLE_SERVICES.length]
  const n    = String(i + 1).padStart(6, '0')
  const d    = new Date(2024, i % 12, (i % 28) + 1)
  const base = svc.price
  const vat  = Math.round(base * 0.18)
  const half = Math.round(base / 2)
  return {
    id:                 `demo-inv-${n}`,
    invoice_number:     `BOOKX-DEMO-${n}`,
    customer_name:      `לקוח דמה ${i + 1}`,
    customer_phone:     '050-0000000',
    service_name:       svc.name,
    service_id:         svc.id,
    amount_before_vat:  base,
    vat_rate:           18,
    vat_amount:         vat,
    total_amount:       base + vat,
    status:             'paid',
    payment_method:     ['cash', 'credit', 'transfer', 'bit', 'check'][i % 5],
    service_date:       d.toISOString(),
    created_at:         d.toISOString(),
    paid_at:            d.toISOString(),
    is_credit_note:     i % 50 === 0,
    is_cancelled:       false,
    invoice_items: [
      { id: `item-${n}-1`, service_id: svc.id, name: svc.name,   quantity: 1, unit_price: base - half, line_total: base - half },
      { id: `item-${n}-2`, service_id: svc.id, name: 'תוספות',   quantity: 1, unit_price: half,        line_total: half        },
    ],
  }
}

export async function generateSampleFiles(invoiceCount = 500) {
  const vatId     = '123456782' // valid Israeli checksum: sum=40
  const primaryId = randomPrimaryId15()
  const from      = '2024-01-01'
  const to        = '2024-12-31'

  const invoices  = Array.from({ length: invoiceCount }, (_, i) => makeSampleInvoice(i))
  const { text: bkmvText, counts } = buildBkmvdata({
    vatId, primaryId, invoices,
    services: SAMPLE_SERVICES,
    businessType: 'osek_morsheh',
  })

  const demoSettings = {
    business_name:                'עסק לדוגמה בע"מ',
    business_tax_id:              vatId,
    business_address_street:      'רחוב הדוגמה',
    business_address_number:      '1',
    business_address_city:        'תל אביב',
    business_address_postal:      '6100000',
    company_registration_number:  '000000000',
    deduction_file_number:        '000000000',
    has_branches:                 false,
    business_type:                'osek_morsheh',
  }
  const iniText = buildIni({ vatId, primaryId, settings: demoSettings, from, to, counts })

  // Pack inner BKMVDATA.zip
  const inner     = new JSZip()
  inner.file('BKMVDATA.TXT', bkmvText)
  const innerBlob = await inner.generateAsync({ type: 'uint8array' })

  const now       = new Date()
  const MMDDhhmm  = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const yy        = String(now.getFullYear()).slice(-2)
  const dirPrefix = `OPENFRMT/${vatId}.${yy}/${MMDDhhmm}/`

  const totalRecords = (counts.B110 || 0) + counts.C100 + counts.D110 + counts.D120 + counts.M100 + 2 // +A100 +Z900

  const outer = new JSZip()
  outer.file(dirPrefix + 'INI.TXT',      iniText)
  outer.file(dirPrefix + 'BKMVDATA.zip', innerBlob)
  outer.file(dirPrefix + 'README.txt', [
    '# BOOKX — קובץ דוגמה לסימולטור רשות המסים',
    '',
    `עסק: ${demoSettings.business_name}`,
    `מס׳ עוסק: ${vatId} (נתוני דמה בלבד)`,
    `תקופה: ${from} עד ${to}`,
    `תוכנה: ${OPERATOR.software_name}`,
    '',
    '## ספירות רשומות (BKMVDATA):',
    `  A100:  1`,
    `  C100:  ${counts.C100}`,
    `  D110:  ${counts.D110}`,
    `  D120:  ${counts.D120}`,
    `  M100:  ${counts.M100}`,
    `  Z900:  1`,
    `  סה"כ:  ${totalRecords}`,
    '',
    'הקובץ מיועד לבדיקה בסימולטור בלבד — לא לשימוש עסקי!',
    `סימולטור: https://secapp.taxes.gov.il/TmbakmmsmlNew/frmCheckFiles.aspx`,
  ].join('\r\n'))

  const blob = await outer.generateAsync({ type: 'blob' })
  return { blob, counts, iniText, bkmvText, totalRecords, dirPrefix }
}

// Re-export for consumers who import from bookxTaxExport
export {
  downloadOpenFormat,
  validateOpenFormatSettings,
  buildSection26Report,
  printSection26,
  generateOpenFormatZip,
}
