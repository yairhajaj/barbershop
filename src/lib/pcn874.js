/**
 * pcn874.js — Generate PCN874 monthly VAT report for Israeli Tax Authority.
 *
 * PCN874 is a fixed-width text file with per-record rows separated by CRLF.
 * Records:
 *   O — Opening (business info + period + totals)
 *   S — Sale (invoice output / עסקה)
 *   T — Purchase/input (expense / תשומה)
 *   Y — Closing (summary totals)
 *
 * Spec reference: https://www.gov.il/BlobFolder/generalpage/dochot_online/he/pcn874.pdf
 *
 * NOTE: This is a minimum viable exporter. Validate against the official simulator before
 * relying on the output for real submissions.
 */

import { supabase } from './supabase'

const CRLF = '\r\n'

function padRight(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return s + ' '.repeat(Math.max(0, len - s.length))
}
function padLeft(val, len) {
  const s = (val ?? '').toString().slice(0, len)
  return '0'.repeat(Math.max(0, len - s.length)) + s
}
function numAgorot(val) {
  // Amount in agorot (shekels × 100), left-padded to 11 digits
  return padLeft(Math.round(Number(val || 0) * 100), 11)
}
function ymd(iso) {
  if (!iso) return '00000000'
  const d = new Date(iso)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Generate a PCN874 TXT file for a given month.
 * @param {Object} params
 * @param {string} params.from    yyyy-mm-dd (1st of month)
 * @param {string} params.to      yyyy-mm-dd (last of month)
 * @param {Object} params.settings business_settings row
 * @returns {Promise<{ text: string, filename: string }>}
 */
export async function generatePcn874({ from, to, settings }) {
  const vatId = (settings?.business_tax_id || '').replace(/\D/g, '') || '000000000'
  const period = from.substring(0, 7).replace('-', '') // yyyymm

  const startIso = `${from}T00:00:00`
  const endIso   = `${to}T23:59:59`

  const [{ data: invoices }, { data: expenses }] = await Promise.all([
    supabase.from('invoices').select('*')
      .gte('created_at', startIso).lte('created_at', endIso)
      .eq('is_cancelled', false),
    supabase.from('expenses').select('*, expense_categories(name)')
      .gte('date', from).lte('date', to)
      .eq('is_cancelled', false),
  ])

  const sales    = invoices ?? []
  const purchases = expenses ?? []

  // Totals
  const totalSales     = sales.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalSalesVat  = sales.reduce((s, i) => s + Number(i.vat_amount || 0), 0)
  const totalSalesBase = sales.reduce((s, i) => s + Number(i.amount_before_vat || 0), 0)
  const totalPurchVat  = purchases.reduce((s, e) => s + Number(e.vat_amount || 0), 0)
  const totalPurchBase = purchases.reduce((s, e) => s + Number(e.amount || 0) - Number(e.vat_amount || 0), 0)

  const lines = []

  // O — Opening record
  lines.push(
    'O' +
    padLeft(vatId, 9) +
    padLeft(period, 6) +                   // yyyymm
    ymd(new Date().toISOString()) +        // file generation date
    numAgorot(totalSalesBase) +
    numAgorot(totalSalesVat) +
    numAgorot(totalPurchBase) +
    numAgorot(totalPurchVat) +
    padLeft(sales.length, 9) +
    padLeft(purchases.length, 9)
  )

  // S — Sales records (one per invoice)
  sales.forEach((inv) => {
    lines.push(
      'S' +
      padLeft(vatId, 9) +
      padRight((inv.invoice_number || '').toString().slice(0, 20), 20) +
      ymd(inv.service_date || inv.created_at) +
      numAgorot(inv.amount_before_vat || 0) +
      numAgorot(inv.vat_amount || 0) +
      padRight((inv.customer_name || '').slice(0, 30), 30)
    )
  })

  // T — Purchase records (one per expense)
  purchases.forEach((exp) => {
    const base = Number(exp.amount || 0) - Number(exp.vat_amount || 0)
    lines.push(
      'T' +
      padLeft(vatId, 9) +
      padRight((exp.vendor_name || '').slice(0, 30), 30) +
      ymd(exp.date) +
      numAgorot(base) +
      numAgorot(exp.vat_amount || 0) +
      padRight((exp.description || '').slice(0, 30), 30)
    )
  })

  // Y — Closing record
  lines.push(
    'Y' +
    padLeft(vatId, 9) +
    padLeft(lines.length + 1, 9) +          // total record count
    numAgorot(totalSalesVat - totalPurchVat) // net VAT due
  )

  const text = lines.join(CRLF) + CRLF
  const filename = `PCN874_${period}_${vatId}.txt`

  return { text, filename, summary: { totalSales, totalSalesVat, totalPurchVat, netVat: totalSalesVat - totalPurchVat } }
}

/**
 * Download PCN874 as a file.
 */
export async function downloadPcn874({ from, to, settings }) {
  const { text, filename } = await generatePcn874({ from, to, settings })
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
