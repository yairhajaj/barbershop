/**
 * xlsx-report.js — Multi-sheet Excel workbook for the accountant.
 * Uses ExcelJS for professional formatting (bold headers, freeze, number format, RTL).
 *
 * Sheets: סיכום | הכנסות | הוצאות | עמלות | חובות | הכנסות ידניות
 */

import ExcelJS from 'exceljs'
import { supabase } from './supabase'

const PAYMENT_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bit: 'ביט', paybox: 'Paybox',
  transfer: 'העברה', check: 'צ׳ק', grow: 'Grow', other: 'אחר',
}

const STATUS_LABELS = {
  draft: 'טיוטה', sent: 'נשלחה', paid: 'שולמה',
  pending: 'ממתין', cancelled: 'מבוטל',
}

// ─── Style constants ───
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
const SECTION_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FAFAFAFA' } }
const HEADER_FONT  = { bold: true, name: 'Arial', size: 10 }
const BODY_FONT    = { name: 'Arial', size: 10 }
const TOTAL_FONT   = { bold: true, name: 'Arial', size: 10 }
const BORDER_SIDE  = { style: 'thin', color: { argb: 'FFDDDDDD' } }
const FULL_BORDER  = { top: BORDER_SIDE, left: BORDER_SIDE, bottom: BORDER_SIDE, right: BORDER_SIDE }
const HEADER_BORDER = { bottom: { style: 'medium', color: { argb: 'FFCCCCCC' } } }
const CURRENCY_FMT = '#,##0.00'
const INT_FMT      = '#,##0'

function applyHeaderRow(row) {
  row.eachCell(cell => {
    cell.fill   = HEADER_FILL
    cell.font   = HEADER_FONT
    cell.border = HEADER_BORDER
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  })
  row.height = 22
}

function applyBodyRow(row, currencyCols = []) {
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font      = BODY_FONT
    cell.border    = FULL_BORDER
    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false }
    if (currencyCols.includes(colNum)) {
      cell.numFmt = CURRENCY_FMT
    }
  })
  row.height = 18
}

function applyTotalRow(row, currencyCols = []) {
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill   = HEADER_FILL
    cell.font   = TOTAL_FONT
    cell.border = FULL_BORDER
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (currencyCols.includes(colNum)) {
      cell.numFmt = CURRENCY_FMT
    }
  })
  row.height = 20
}

function setRTLFrozen(ws) {
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }]
}

export async function fetchFinancialData({ from, to }) {
  const startIso = `${from}T00:00:00`
  const endIso   = `${to}T23:59:59`

  const [
    { data: invoices },
    { data: expenses },
    { data: commissions },
    { data: debts },
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
      .gte('created_at', startIso).lte('created_at', endIso)
      .neq('status', 'paid')
      .order('created_at', { ascending: true }),
  ])

  return {
    invoices:    invoices    ?? [],
    expenses:    expenses    ?? [],
    commissions: commissions ?? [],
    debts:       debts       ?? [],
  }
}

export async function buildWorkbook({ from, to, settings, data }) {
  const wb = new ExcelJS.Workbook()
  wb.creator  = settings?.business_name || 'HAJAJ'
  wb.created  = new Date()
  wb.modified = new Date()

  const { invoices, expenses, commissions, debts } = data

  // ─── Sheet 1: Summary ───────────────────────────────────────────────
  const wsSummary = wb.addWorksheet('סיכום')
  setRTLFrozen(wsSummary)
  wsSummary.columns = [
    { width: 34 },
    { width: 18 },
  ]

  const activeInvoices   = invoices.filter(i => !i.is_cancelled)
  const totalIncome      = activeInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalIncomeVat   = activeInvoices.reduce((s, i) => s + Number(i.vat_amount   || 0), 0)
  const activeExpenses   = expenses.filter(e => !e.is_cancelled)
  const totalExpenses    = activeExpenses.reduce((s, e) => s + Number(e.amount        || 0), 0)
  const totalExpVat      = activeExpenses.reduce((s, e) => s + Number(e.vat_amount    || 0), 0)
  const totalCommissions = commissions.reduce((s, c)    => s + Number(c.amount        || 0), 0)
  const totalDebt        = debts.reduce((s, d)          => s + Number(d.amount        || 0), 0)
  const profit           = totalIncome - totalExpenses
  const netVat           = totalIncomeVat - totalExpVat

  function addSectionHeader(label) {
    const r = wsSummary.addRow([label, ''])
    wsSummary.mergeCells(`A${r.number}:B${r.number}`)
    r.getCell(1).fill   = SECTION_FILL
    r.getCell(1).font   = { bold: true, name: 'Arial', size: 10, color: { argb: 'FF555555' } }
    r.getCell(1).alignment = { horizontal: 'right' }
    r.height = 20
  }

  function addDataRow(label, value, isCurrency = true) {
    const r = wsSummary.addRow([label, value])
    r.getCell(1).font      = BODY_FONT
    r.getCell(1).alignment = { horizontal: 'right' }
    r.getCell(2).font      = BODY_FONT
    r.getCell(2).alignment = { horizontal: 'left' }
    if (isCurrency && typeof value === 'number') r.getCell(2).numFmt = CURRENCY_FMT
    r.getCell(1).border = FULL_BORDER
    r.getCell(2).border = FULL_BORDER
    r.height = 18
  }

  // Title row
  const titleRow = wsSummary.addRow(['דוח פיננסי — ' + (settings?.business_name || ''), ''])
  wsSummary.mergeCells(`A1:B1`)
  titleRow.getCell(1).font      = { bold: true, name: 'Arial', size: 13 }
  titleRow.getCell(1).alignment = { horizontal: 'right' }
  titleRow.height = 28
  wsSummary.addRow([])

  addDataRow('מס׳ עוסק / ח.פ.',     settings?.business_tax_id || '',           false)
  addDataRow('סוג עסק',             settings?.business_type === 'osek_patur' ? 'עוסק פטור' : settings?.business_type === 'company' ? 'חברה' : 'עוסק מורשה', false)
  addDataRow('תקופה',               `${from} — ${to}`,                         false)
  addDataRow('הופק בתאריך',         new Date().toLocaleString('he-IL'),         false)
  wsSummary.addRow([])

  addSectionHeader('הכנסות')
  addDataRow('הכנסות מחשבוניות', totalIncome)
  addDataRow('סה״כ הכנסות',      totalIncome)
  wsSummary.addRow([])

  addSectionHeader('הוצאות')
  addDataRow('הוצאות',             totalExpenses)
  addDataRow('עמלות עובדים',       totalCommissions)
  wsSummary.addRow([])

  addSectionHeader('רווח')
  addDataRow('רווח גולמי',         profit)
  wsSummary.addRow([])

  addSectionHeader('מע״מ')
  addDataRow('מע״מ עסקאות (הכנסות)', totalIncomeVat)
  addDataRow('מע״מ תשומות (הוצאות)', totalExpVat)
  addDataRow('מע״מ לתשלום',          netVat)
  wsSummary.addRow([])

  addSectionHeader('נתונים נוספים')
  addDataRow('חובות פתוחים בתקופה',    totalDebt)
  addDataRow('מספר חשבוניות פעילות',   activeInvoices.length,                 false)
  addDataRow('מספר חשבוניות מבוטלות',  invoices.length - activeInvoices.length, false)
  addDataRow('מספר הוצאות פעילות',     activeExpenses.length,                 false)

  // ─── Sheet 2: Income (invoices) ─────────────────────────────────────
  const wsIncome = wb.addWorksheet('הכנסות')
  setRTLFrozen(wsIncome)
  wsIncome.columns = [
    { header: 'מספר חשבונית', width: 16 },
    { header: 'תאריך',        width: 12 },
    { header: 'לקוח',         width: 22 },
    { header: 'טלפון',        width: 15 },
    { header: 'שירות',        width: 24 },
    { header: 'מטפל/ת',       width: 16 },
    { header: 'תאריך שירות',  width: 13 },
    { header: 'לפני מע״מ',   width: 13 },
    { header: 'מע״מ',         width: 11 },
    { header: 'סה״כ',         width: 13 },
    { header: 'סטטוס',        width: 11 },
    { header: 'הערת זיכוי',   width: 28 },
    { header: 'הערות',        width: 20 },
  ]
  applyHeaderRow(wsIncome.getRow(1))

  const invoiceNumById = Object.fromEntries(invoices.map(i => [i.id, i.invoice_number]))

  const incomeCurrencyCols = [8, 9, 10]
  invoices.forEach(i => {
    let creditNote = ''
    if (i.credit_note_for) {
      const orig = invoiceNumById[i.credit_note_for] || i.credit_note_for
      creditNote = `חשבונית זיכוי של ${orig}`
    } else if (i.is_cancelled) {
      creditNote = 'בוטלה — הופקה חשבונית זיכוי'
    }
    const r = wsIncome.addRow([
      i.invoice_number,
      fmtDate(i.created_at),
      i.customer_name  || '',
      i.customer_phone || '',
      i.service_name   || '',
      i.staff_name     || '',
      fmtDate(i.service_date),
      Number(i.amount_before_vat || 0),
      Number(i.vat_amount        || 0),
      Number(i.total_amount      || 0),
      STATUS_LABELS[i.status] || i.status,
      creditNote,
      i.notes || '',
    ])
    applyBodyRow(r, incomeCurrencyCols)
    if (i.is_cancelled || i.credit_note_for) r.eachCell(c => { c.font = { ...BODY_FONT, color: { argb: 'FFAAAAAA' } } })
  })

  if (invoices.length) {
    const lastDataRow = 1 + invoices.length
    const totalRow = wsIncome.addRow([
      'סה״כ', '', '', '', '', '', '',
      { formula: `SUM(H2:H${lastDataRow})` },
      { formula: `SUM(I2:I${lastDataRow})` },
      { formula: `SUM(J2:J${lastDataRow})` },
      '', '', '',
    ])
    applyTotalRow(totalRow, incomeCurrencyCols)
  }

  // ─── Sheet 3: Expenses ──────────────────────────────────────────────
  const wsExp = wb.addWorksheet('הוצאות')
  setRTLFrozen(wsExp)
  wsExp.columns = [
    { header: 'תאריך',           width: 12 },
    { header: 'ספק',             width: 24 },
    { header: 'תיאור',           width: 30 },
    { header: 'קטגוריה',         width: 18 },
    { header: 'אמצעי תשלום',     width: 15 },
    { header: 'סכום',            width: 13 },
    { header: 'מע״מ',            width: 11 },
    { header: 'חוזר?',           width: 9  },
    { header: 'מבוטלת?',         width: 10 },
    { header: 'קישורים לקבלות',  width: 50 },
    { header: 'הערות',           width: 24 },
  ]
  applyHeaderRow(wsExp.getRow(1))

  const expCurrencyCols = [6, 7]
  expenses.forEach(e => {
    const allUrls = [e.receipt_url, ...(e.receipt_urls ?? [])].filter(Boolean).join(', ')
    const r = wsExp.addRow([
      fmtDate(e.date),
      e.vendor_name    || '',
      e.description    || '',
      e.expense_categories?.name || '',
      PAYMENT_LABELS[e.payment_method] || e.payment_method || '',
      Number(e.amount     || 0),
      Number(e.vat_amount || 0),
      e.is_recurring ? 'כן' : '',
      e.is_cancelled ? 'כן' : '',
      allUrls,
      e.notes || '',
    ])
    applyBodyRow(r, expCurrencyCols)
    if (e.is_cancelled) r.eachCell(c => { c.font = { ...BODY_FONT, color: { argb: 'FFAAAAAA' } } })
  })

  if (expenses.length) {
    const lastDataRow = 1 + expenses.length
    const totalRow = wsExp.addRow([
      'סה״כ', '', '', '', '',
      { formula: `SUM(F2:F${lastDataRow})` },
      { formula: `SUM(G2:G${lastDataRow})` },
      '', '', '', '',
    ])
    applyTotalRow(totalRow, expCurrencyCols)
  }

  // ─── Sheet 4: Commissions ───────────────────────────────────────────
  const wsComm = wb.addWorksheet('עמלות')
  setRTLFrozen(wsComm)
  wsComm.columns = [
    { header: 'תאריך',       width: 12 },
    { header: 'עובד/ת',      width: 20 },
    { header: 'סוג',         width: 13 },
    { header: 'אחוז',        width: 10 },
    { header: 'סכום',        width: 13 },
    { header: 'סטטוס',       width: 11 },
    { header: 'שולם בתאריך', width: 14 },
    { header: 'הערות',       width: 24 },
  ]
  applyHeaderRow(wsComm.getRow(1))

  const commCurrencyCols = [5]
  commissions.forEach(c => {
    const r = wsComm.addRow([
      fmtDate(c.date),
      c.staff?.name || '',
      c.type === 'percentage' ? 'אחוזים' : c.type === 'fixed' ? 'קבוע' : 'משכורת',
      c.percentage ? `${c.percentage}%` : '',
      Number(c.amount || 0),
      c.status === 'paid' ? 'שולם' : 'ממתין',
      c.paid_at ? fmtDate(c.paid_at) : '',
      c.notes || '',
    ])
    applyBodyRow(r, commCurrencyCols)
  })

  if (commissions.length) {
    const lastDataRow = 1 + commissions.length
    const totalRow = wsComm.addRow([
      'סה״כ', '', '', '',
      { formula: `SUM(E2:E${lastDataRow})` },
      '', '', '',
    ])
    applyTotalRow(totalRow, commCurrencyCols)
  }

  // ─── Sheet 5: Debts ─────────────────────────────────────────────────
  const wsDebt = wb.addWorksheet('חובות')
  setRTLFrozen(wsDebt)
  wsDebt.columns = [
    { header: 'תאריך', width: 12 },
    { header: 'לקוח',  width: 24 },
    { header: 'טלפון', width: 15 },
    { header: 'תיאור', width: 32 },
    { header: 'סכום',  width: 13 },
    { header: 'סטטוס', width: 12 },
  ]
  applyHeaderRow(wsDebt.getRow(1))

  const debtCurrencyCols = [5]
  debts.forEach(d => {
    const r = wsDebt.addRow([
      fmtDate(d.created_at),
      d.profiles?.name  || '',
      d.profiles?.phone || '',
      d.description     || '',
      Number(d.amount   || 0),
      STATUS_LABELS[d.status] || d.status,
    ])
    applyBodyRow(r, debtCurrencyCols)
  })

  if (debts.length) {
    const lastDataRow = 1 + debts.length
    const totalRow = wsDebt.addRow([
      'סה״כ', '', '', '',
      { formula: `SUM(E2:E${lastDataRow})` },
      '',
    ])
    applyTotalRow(totalRow, debtCurrencyCols)
  }

  return wb
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('he-IL')
  } catch { return String(iso) }
}

export async function generateFinancialReport({ from, to, settings }) {
  const data = await fetchFinancialData({ from, to })
  const wb   = await buildWorkbook({ from, to, settings, data })
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return {
    arrayBuffer,
    filename: `financial_report_${from}_${to}.xlsx`,
    data,
  }
}

const DAYS_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function fmtDateDMY(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function apptStatusLabel(appt) {
  if (appt.no_show)                       return '⚫ לא הגיע'
  if (appt.status === 'cancelled')        return '❌ בוטל'
  if (appt.status === 'completed')        return '✅ בוצע'
  if (appt.status === 'pending_reschedule') return '🔄 ממתין לשינוי'
  return '📅 מאושר'
}

function apptFillArgb(appt) {
  if (appt.no_show)                return 'FFF3F4F6'  // gray
  if (appt.status === 'cancelled') return 'FFFEE2E2'  // red
  if (appt.status === 'completed') return 'FFDCFCE7'  // green
  return null
}

export async function generateWorkLog({ from, to, settings }) {
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, profiles(id, name, phone), services(id, name, price), staff(id, name)')
    .gte('start_at', `${from}T00:00:00`)
    .lte('start_at', `${to}T23:59:59`)
    .order('start_at', { ascending: true })

  const appts = appointments ?? []

  const wb = new ExcelJS.Workbook()
  wb.creator  = settings?.business_name || 'HAJAJ'
  wb.created  = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet('יומן עבודה')
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft' }]
  ws.columns = [
    { width: 6  },  // #
    { width: 13 },  // תאריך
    { width: 10 },  // יום
    { width: 8  },  // שעה
    { width: 22 },  // לקוח
    { width: 15 },  // טלפון
    { width: 22 },  // שירות
    { width: 16 },  // ספר
    { width: 10 },  // מחיר
    { width: 13 },  // סטטוס
    { width: 24 },  // סיבת ביטול
    { width: 14 },  // נקבע בתאריך
  ]

  const addMergedInfoRow = (text) => {
    const r = ws.addRow([text, '', '', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells(`A${r.number}:L${r.number}`)
    r.getCell(1).font      = { name: 'Arial', size: 10, bold: true }
    r.getCell(1).alignment = { horizontal: 'right' }
    r.height = 18
  }

  const [fy, fm, fd] = from.split('-')
  const [ty, tm, td] = to.split('-')
  addMergedInfoRow(`שם עסק: ${settings?.business_name || 'HAJAJ Hair Design'}`)
  addMergedInfoRow(`תקופה: ${fd}/${fm}/${fy} – ${td}/${tm}/${ty}`)
  addMergedInfoRow(`תאריך הפקה: ${new Date().toLocaleString('he-IL')}`)
  ws.addRow([])

  const headerRow = ws.addRow(['#', 'תאריך', 'יום', 'שעה', 'לקוח', 'טלפון', 'שירות', 'ספר', 'מחיר', 'סטטוס', 'סיבת ביטול', 'נקבע בתאריך'])
  applyHeaderRow(headerRow)

  let seq = 1
  let currentMonthKey = null
  let monthGroup = []
  let totCompleted = 0, totCancelled = 0, totNoShow = 0, totRevenue = 0

  const flushMonth = (key, group) => {
    const comp    = group.filter(a => a.status === 'completed' && !a.no_show)
    const canc    = group.filter(a => a.status === 'cancelled').length
    const noshow  = group.filter(a => a.no_show).length
    const revenue = comp.reduce((s, a) => s + Number(a.services?.price || 0), 0)
    const [y, m]  = key.split('-')
    const label   = `${MONTHS_HE[parseInt(m, 10) - 1]} ${y}`
    const text    = `סיכום ${label}: ${group.length} תורים  |  ${comp.length} בוצעו  |  ${canc} בוטלו  |  ${noshow} לא הגיעו  |  הכנסות: ₪${revenue.toLocaleString('he-IL')}`
    const r = ws.addRow([text, '', '', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells(`A${r.number}:L${r.number}`)
    r.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
    r.getCell(1).font      = { bold: true, name: 'Arial', size: 10 }
    r.getCell(1).alignment = { horizontal: 'right' }
    r.height = 22
    totCompleted += comp.length
    totCancelled += canc
    totNoShow    += noshow
    totRevenue   += revenue
  }

  for (const appt of appts) {
    const d        = new Date(appt.start_at)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    if (currentMonthKey !== monthKey) {
      if (currentMonthKey !== null) flushMonth(currentMonthKey, monthGroup)
      currentMonthKey = monthKey
      monthGroup      = []
    }
    monthGroup.push(appt)

    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    const r = ws.addRow([
      seq++,
      fmtDateDMY(appt.start_at),
      DAYS_HE[d.getDay()],
      timeStr,
      appt.profiles?.name        || '',
      appt.profiles?.phone       || '',
      appt.services?.name        || '',
      appt.staff?.name           || '',
      Number(appt.services?.price || 0),
      apptStatusLabel(appt),
      appt.cancellation_reason   || '',
      fmtDateDMY(appt.created_at),
    ])
    applyBodyRow(r, [9])
    const fill = apptFillArgb(appt)
    if (fill) {
      r.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      })
    }
  }

  if (currentMonthKey !== null) flushMonth(currentMonthKey, monthGroup)

  if (appts.length > 0) {
    const grandText = `סה"כ כל התקופה: ${appts.length} תורים  |  ${totCompleted} בוצעו  |  ${totCancelled} בוטלו  |  ${totNoShow} לא הגיעו  |  הכנסות: ₪${totRevenue.toLocaleString('he-IL')}`
    const r = ws.addRow([grandText, '', '', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells(`A${r.number}:L${r.number}`)
    r.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
    r.getCell(1).font      = { bold: true, name: 'Arial', size: 11 }
    r.getCell(1).alignment = { horizontal: 'right' }
    r.height = 24
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return {
    arrayBuffer,
    filename: `יומן_עבודה_${from}_${to}.xlsx`,
  }
}

// ─── Invoices Excel (InvoicesTab export) ──────────────────────────────────────
export async function generateInvoicesExcel({ invoices, settings }) {
  const wb = new ExcelJS.Workbook()
  wb.creator  = settings?.business_name || 'HAJAJ'
  wb.created  = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet('חשבוניות')
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }]

  ws.columns = [
    { header: 'מס׳ חשבונית', width: 16 },
    { header: 'תאריך',       width: 13 },
    { header: 'לקוח',        width: 22 },
    { header: 'טלפון',       width: 15 },
    { header: 'שירות',       width: 24 },
    { header: 'ספר',         width: 16 },
    { header: 'לפני מע״מ',  width: 13 },
    { header: 'מע״מ',        width: 11 },
    { header: 'סה״כ',        width: 13 },
    { header: 'סטטוס',       width: 11 },
    { header: 'סוג',         width: 10 },
  ]
  applyHeaderRow(ws.getRow(1))

  const currencyCols = [7, 8, 9]
  const active = invoices.filter(i => !i.is_cancelled && !i.credit_note_for)

  invoices.forEach(inv => {
    const isCancelled = inv.is_cancelled
    const isCredit    = !!inv.credit_note_for
    const r = ws.addRow([
      inv.invoice_number || '',
      fmtDate(inv.service_date || inv.created_at),
      inv.customer_name  || '',
      inv.customer_phone || '',
      inv.service_name   || '',
      inv.staff_name     || '',
      Number(inv.amount_before_vat || 0),
      Number(inv.vat_amount        || 0),
      Number(inv.total_amount      || 0),
      STATUS_LABELS[inv.status] || inv.status || '',
      isCredit ? 'זיכוי' : isCancelled ? 'מבוטלת' : 'חשבונית',
    ])
    applyBodyRow(r, currencyCols)
    if (isCancelled || isCredit) {
      r.eachCell(c => { c.font = { ...BODY_FONT, color: { argb: 'FFAAAAAA' } } })
    }
  })

  if (invoices.length) {
    const lastRow = invoices.length + 1
    const totalRow = ws.addRow([
      `סה״כ (${active.length} חשבוניות פעילות)`, '', '', '', '', '',
      { formula: `SUMIF(K2:K${lastRow},"חשבונית",G2:G${lastRow})` },
      { formula: `SUMIF(K2:K${lastRow},"חשבונית",H2:H${lastRow})` },
      { formula: `SUMIF(K2:K${lastRow},"חשבונית",I2:I${lastRow})` },
      '', '',
    ])
    applyTotalRow(totalRow, currencyCols)
  }

  const today = new Date().toISOString().slice(0, 10)
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return { arrayBuffer, filename: `חשבוניות_${today}.xlsx` }
}

export function downloadWorkbook(arrayBuffer, filename) {
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
