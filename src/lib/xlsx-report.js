/**
 * xlsx-report.js — Generate a multi-sheet Excel workbook for the accountant.
 * Uses SheetJS (xlsx) — installed as a dependency.
 *
 * Sheets:
 *   1. סיכום        — high-level totals + VAT breakdown
 *   2. הכנסות       — all invoices
 *   3. הוצאות       — all expenses
 *   4. עמלות        — staff_commissions
 *   5. חובות        — customer_debts (pending)
 *   6. הכנסות ידניות — manual_income
 */

import * as XLSX from 'xlsx'
import { supabase } from './supabase'

const PAYMENT_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bit: 'ביט', paybox: 'Paybox',
  transfer: 'העברה', check: 'צ׳ק', grow: 'Grow', other: 'אחר',
}

const STATUS_LABELS = {
  draft: 'טיוטה', sent: 'נשלחה', paid: 'שולמה',
  pending: 'ממתין', cancelled: 'מבוטל',
}

/**
 * Fetch all financial data for the given date range.
 */
export async function fetchFinancialData({ from, to }) {
  const startIso = `${from}T00:00:00`
  const endIso   = `${to}T23:59:59`

  const [
    { data: invoices },
    { data: expenses },
    { data: commissions },
    { data: debts },
    { data: manualInc },
  ] = await Promise.all([
    supabase.from('invoices')
      .select('*')
      .gte('created_at', startIso).lte('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase.from('expenses')
      .select('*, expense_categories(name, icon)')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: true }),
    supabase.from('staff_commissions')
      .select('*, staff(name)')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: true }),
    supabase.from('customer_debts')
      .select('*, profiles(name, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.from('manual_income')
      .select('*, staff(name), services(name)')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: true }),
  ])

  return {
    invoices: invoices ?? [],
    expenses: expenses ?? [],
    commissions: commissions ?? [],
    debts: debts ?? [],
    manualIncome: manualInc ?? [],
  }
}

/**
 * Build the workbook.
 * @param {Object} params
 * @param {string} params.from      — ISO date yyyy-mm-dd
 * @param {string} params.to        — ISO date yyyy-mm-dd
 * @param {Object} params.settings  — business_settings row
 * @param {Object} params.data      — result of fetchFinancialData
 * @returns {ArrayBuffer}
 */
export function buildWorkbook({ from, to, settings, data }) {
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }

  const { invoices, expenses, commissions, debts, manualIncome } = data

  // ─── Sheet 1: Summary ───
  const activeInvoices = invoices.filter(i => !i.is_cancelled)
  const totalIncome    = activeInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalIncomeVat = activeInvoices.reduce((s, i) => s + Number(i.vat_amount || 0), 0)
  const totalManual    = manualIncome.reduce((s, m) => s + Number(m.amount || 0), 0)
  const totalManualVat = manualIncome.reduce((s, m) => s + Number(m.vat_amount || 0), 0)
  const activeExpenses = expenses.filter(e => !e.is_cancelled)
  const totalExpenses  = activeExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalExpVat    = activeExpenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0)
  const totalCommissions = commissions.reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalDebt      = debts.reduce((s, d) => s + Number(d.amount || 0), 0)

  const allIncome   = totalIncome + totalManual
  const allIncomeVat = totalIncomeVat + totalManualVat
  const profit      = allIncome - totalExpenses
  const netVat      = allIncomeVat - totalExpVat

  const summaryRows = [
    ['דוח פיננסי', ''],
    ['עסק', settings?.business_name || ''],
    ['מס׳ עוסק', settings?.business_tax_id || ''],
    ['סוג עסק', settings?.business_type === 'osek_patur' ? 'עוסק פטור' : settings?.business_type === 'company' ? 'חברה' : 'עוסק מורשה'],
    ['תקופה', `${from} עד ${to}`],
    ['הופק בתאריך', new Date().toLocaleString('he-IL')],
    ['מספר רישום תוכנה', settings?.tax_software_reg_number || '(לא הוזן)'],
    [''],
    ['סעיף', 'סכום (₪)'],
    ['הכנסות מחשבוניות', totalIncome],
    ['הכנסות ידניות', totalManual],
    ['סה״כ הכנסות', allIncome],
    [''],
    ['הוצאות', totalExpenses],
    ['עמלות עובדים', totalCommissions],
    [''],
    ['רווח גולמי', profit],
    [''],
    ['מע״מ עסקאות (הכנסות)', allIncomeVat],
    ['מע״מ תשומות (הוצאות)', totalExpVat],
    ['מע״מ לתשלום', netVat],
    [''],
    ['חובות פתוחים', totalDebt],
    [''],
    ['מספר חשבוניות פעילות', activeInvoices.length],
    ['מספר חשבוניות מבוטלות', invoices.length - activeInvoices.length],
    ['מספר הוצאות פעילות', activeExpenses.length],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 32 }, { wch: 18 }]
  wsSummary['!rows'] = [{ hpx: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום')

  // ─── Sheet 2: Income (invoices) ───
  const incomeHeaders = ['מספר חשבונית', 'תאריך', 'לקוח', 'טלפון', 'שירות', 'מטפל/ת', 'תאריך שירות', 'לפני מע״מ', 'מע״מ', 'סה״כ', 'אמצעי תשלום', 'סטטוס', 'מבוטלת?', 'הערה']
  const incomeRows = invoices.map(i => [
    i.invoice_number,
    fmtDate(i.created_at),
    i.customer_name || '',
    i.customer_phone || '',
    i.service_name || '',
    i.staff_name || '',
    fmtDate(i.service_date),
    Number(i.amount_before_vat || 0),
    Number(i.vat_amount || 0),
    Number(i.total_amount || 0),
    PAYMENT_LABELS[i.notes] || i.notes || '',
    STATUS_LABELS[i.status] || i.status,
    i.is_cancelled ? 'כן' : '',
    i.credit_note_for ? 'חשבונית זיכוי' : '',
  ])
  const wsIncome = XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows])
  wsIncome['!cols'] = [{wch:14},{wch:11},{wch:20},{wch:14},{wch:22},{wch:14},{wch:11},{wch:12},{wch:10},{wch:12},{wch:14},{wch:10},{wch:10},{wch:16}]
  XLSX.utils.book_append_sheet(wb, wsIncome, 'הכנסות')

  // ─── Sheet 3: Expenses ───
  const expHeaders = ['תאריך', 'ספק', 'תיאור', 'קטגוריה', 'אמצעי תשלום', 'סכום', 'מע״מ', 'חוזר?', 'מבוטלת?', 'קישור לקבלה', 'הערות']
  const expRows = expenses.map(e => [
    fmtDate(e.date),
    e.vendor_name || '',
    e.description || '',
    e.expense_categories?.name || '',
    PAYMENT_LABELS[e.payment_method] || e.payment_method || '',
    Number(e.amount || 0),
    Number(e.vat_amount || 0),
    e.is_recurring ? 'כן' : '',
    e.is_cancelled ? 'כן' : '',
    e.receipt_url || (e.receipt_urls?.[0] ?? ''),
    e.notes || '',
  ])
  const wsExp = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows])
  wsExp['!cols'] = [{wch:11},{wch:22},{wch:28},{wch:16},{wch:14},{wch:10},{wch:10},{wch:8},{wch:10},{wch:40},{wch:22}]
  XLSX.utils.book_append_sheet(wb, wsExp, 'הוצאות')

  // ─── Sheet 4: Commissions ───
  const commHeaders = ['תאריך', 'עובד/ת', 'סוג', 'אחוז', 'סכום', 'סטטוס', 'שולם בתאריך', 'הערות']
  const commRows = commissions.map(c => [
    fmtDate(c.date),
    c.staff?.name || '',
    c.type === 'percentage' ? 'אחוזים' : c.type === 'fixed' ? 'קבוע' : 'משכורת',
    c.percentage ? `${c.percentage}%` : '',
    Number(c.amount || 0),
    c.status === 'paid' ? 'שולם' : 'ממתין',
    c.paid_at ? fmtDate(c.paid_at) : '',
    c.notes || '',
  ])
  const wsComm = XLSX.utils.aoa_to_sheet([commHeaders, ...commRows])
  wsComm['!cols'] = [{wch:11},{wch:18},{wch:12},{wch:10},{wch:12},{wch:10},{wch:14},{wch:22}]
  XLSX.utils.book_append_sheet(wb, wsComm, 'עמלות')

  // ─── Sheet 5: Debts ───
  const debtHeaders = ['תאריך', 'לקוח', 'טלפון', 'תיאור', 'סכום']
  const debtRows = debts.map(d => [
    fmtDate(d.created_at),
    d.profiles?.name || '',
    d.profiles?.phone || '',
    d.description || '',
    Number(d.amount || 0),
  ])
  const wsDebt = XLSX.utils.aoa_to_sheet([debtHeaders, ...debtRows])
  wsDebt['!cols'] = [{wch:11},{wch:22},{wch:14},{wch:30},{wch:12}]
  XLSX.utils.book_append_sheet(wb, wsDebt, 'חובות')

  // ─── Sheet 6: Manual Income ───
  const miHeaders = ['תאריך', 'תיאור', 'לקוח', 'מטפל/ת', 'שירות', 'אמצעי תשלום', 'סכום', 'מע״מ', 'הערות']
  const miRows = manualIncome.map(m => [
    fmtDate(m.date),
    m.description || '',
    m.customer_name || '',
    m.staff?.name || '',
    m.services?.name || '',
    PAYMENT_LABELS[m.payment_method] || m.payment_method || '',
    Number(m.amount || 0),
    Number(m.vat_amount || 0),
    m.notes || '',
  ])
  const wsMi = XLSX.utils.aoa_to_sheet([miHeaders, ...miRows])
  wsMi['!cols'] = [{wch:11},{wch:26},{wch:18},{wch:14},{wch:18},{wch:14},{wch:10},{wch:10},{wch:22}]
  XLSX.utils.book_append_sheet(wb, wsMi, 'הכנסות ידניות')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('he-IL')
  } catch { return iso }
}

/**
 * High-level helper: fetches data + builds workbook.
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, filename: string }>}
 */
export async function generateFinancialReport({ from, to, settings }) {
  const data = await fetchFinancialData({ from, to })
  const arrayBuffer = buildWorkbook({ from, to, settings, data })
  return {
    arrayBuffer,
    filename: `financial_report_${from}_${to}.xlsx`,
    data,
  }
}

/**
 * Download the workbook as a file in the browser.
 */
export function downloadWorkbook(arrayBuffer, filename) {
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
