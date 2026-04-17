/**
 * Finance utility functions — VAT calculations, CSV export, tax periods
 */

/**
 * Calculate VAT breakdown from a total amount.
 * @param {number} total      - Total amount (VAT inclusive)
 * @param {number} vatRate    - VAT percentage (e.g. 18)
 * @param {string} businessType - 'osek_morsheh' | 'osek_patur' | 'company'
 */
export function calcVat(total, vatRate = 18, businessType = 'osek_morsheh') {
  if (businessType === 'osek_patur') {
    return { beforeVat: total, vatAmount: 0, total }
  }
  const rate = vatRate / 100
  const beforeVat = Math.round(total / (1 + rate))
  const vatAmount = total - beforeVat
  return { beforeVat, vatAmount, total }
}

/**
 * Format amount as ILS currency
 */
export function formatILS(amount) {
  return `₪${Number(amount || 0).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Get Israeli bi-monthly tax periods for a year.
 * Returns array of { label, startDate, endDate }
 */
export function getBiMonthlyPeriods(year) {
  const periods = []
  for (let m = 0; m < 12; m += 2) {
    const start = `${year}-${String(m + 1).padStart(2, '0')}-01`
    const endMonth = m + 2
    const endYear = endMonth > 12 ? year + 1 : year
    const endM = endMonth > 12 ? 1 : endMonth
    const lastDay = new Date(endYear, endM, 0).getDate()
    const end = `${endYear}-${String(endM).padStart(2, '0')}-${lastDay}`

    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
    periods.push({
      label: `${monthNames[m]}–${monthNames[m + 1]} ${year}`,
      startDate: start,
      endDate: end,
    })
  }
  return periods
}

/**
 * Generate CSV from data array. Returns a downloadable Blob URL.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @param {string} filename
 */
export function downloadCSV(headers, rows, filename = 'export.csv') {
  // BOM for Hebrew support in Excel
  const BOM = '\uFEFF'
  const csv = BOM + [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Payment method labels (Hebrew)
 */
export const PAYMENT_METHODS = {
  cash:     '💵 מזומן',
  credit:   '💳 אשראי',
  bit:      '📱 ביט',
  paybox:   '📦 Paybox',
  transfer: '🏦 העברה',
  check:    '📄 צ׳ק',
  grow:     '🌐 Grow',
}

/**
 * Invoice document title based on business type
 */
export function invoiceTitle(businessType) {
  return businessType === 'osek_patur' ? 'חשבונית עסקה' : 'חשבונית מס'
}

/**
 * Whether VAT applies for this business type
 */
export function hasVat(businessType) {
  return businessType !== 'osek_patur'
}
