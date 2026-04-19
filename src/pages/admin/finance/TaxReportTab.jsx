import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useBranch } from '../../../contexts/BranchContext'
import { formatILS, getBiMonthlyPeriods, hasVat, downloadCSV } from '../../../lib/finance'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'
import {
  downloadOpenFormat,
  validateOpenFormatSettings,
  printSection26,
  buildSection26Report,
  generateSampleFiles,
} from '../../../lib/bookxTaxExport'

const PERIOD_TYPES = [
  { value: 'monthly',    label: 'חודשי' },
  { value: 'bi-monthly', label: 'דו-חודשי' },
  { value: 'quarterly',  label: 'רבעוני' },
]

const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function getMonthlyPeriods(year) {
  return MONTH_NAMES.map((name, i) => {
    const m = i + 1
    const lastDay = new Date(year, m, 0).getDate()
    return {
      label: `${name} ${year}`,
      startDate: `${year}-${String(m).padStart(2, '0')}-01`,
      endDate: `${year}-${String(m).padStart(2, '0')}-${lastDay}`,
    }
  })
}

function getQuarterlyPeriods(year) {
  return [
    { label: `Q1 - ינואר–מרץ ${year}`,     months: [1, 3] },
    { label: `Q2 - אפריל–יוני ${year}`,     months: [4, 6] },
    { label: `Q3 - יולי–ספטמבר ${year}`,   months: [7, 9] },
    { label: `Q4 - אוקטובר–דצמבר ${year}`, months: [10, 12] },
  ].map(q => {
    const lastDay = new Date(year, q.months[1], 0).getDate()
    return {
      label: q.label,
      startDate: `${year}-${String(q.months[0]).padStart(2, '0')}-01`,
      endDate:   `${year}-${String(q.months[1]).padStart(2, '0')}-${lastDay}`,
    }
  })
}

const METHOD_LABELS = {
  cash: '💵 מזומן', credit: '💳 אשראי', bit: '📱 ביט', paybox: '📦 Paybox',
  transfer: '🏦 העברה', check: '📄 צ׳ק', grow: '🌐 Grow', other: '📦 אחר',
}

export function TaxReportTab() {
  const showToast = useToast()
  const { settings } = useBusinessSettings()
  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null

  const businessType = settings?.business_type || 'osek_morsheh'
  const vatRate      = settings?.vat_rate ?? 18
  const showVat      = hasVat(businessType)

  const currentYear = new Date().getFullYear()
  const [year, setYear]               = useState(currentYear)
  const [periodType, setPeriodType]   = useState('bi-monthly')
  const [periodIdx, setPeriodIdx]     = useState(0)
  const [loading, setLoading]         = useState(false)
  const [showAccountant, setShowAccountant] = useState(false)
  const [exportLoading, setExportLoading]   = useState(false)
  const [sampleLoading, setSampleLoading]   = useState(false)
  const [exportWarnings, setExportWarnings] = useState([])

  const [incomeRows, setIncomeRows]     = useState([])
  const [expenseRows, setExpenseRows]   = useState([])
  const [incomeCount, setIncomeCount]   = useState(0)
  const [expenseCount, setExpenseCount] = useState(0)

  const periods = useMemo(() => {
    if (periodType === 'monthly')   return getMonthlyPeriods(year)
    if (periodType === 'quarterly') return getQuarterlyPeriods(year)
    return getBiMonthlyPeriods(year)
  }, [periodType, year])

  useEffect(() => {
    const now = new Date()
    if (year === now.getFullYear()) {
      const m = now.getMonth()
      let idx = periodType === 'monthly' ? m : periodType === 'bi-monthly' ? Math.floor(m / 2) : Math.floor(m / 3)
      setPeriodIdx(Math.min(idx, periods.length - 1))
    } else {
      setPeriodIdx(0)
    }
  }, [periodType, year])

  const currentPeriod = periods[periodIdx]

  // re-fetch when period OR business settings change
  useEffect(() => { if (currentPeriod && businessType) fetchData() }, [currentPeriod, businessType, vatRate, branchId])

  async function fetchData() {
    setLoading(true)
    try {
    const { startDate, endDate } = currentPeriod
    const effectiveVatRate = vatRate || 18

    const branchOr = branchId ? `branch_id.eq.${branchId},branch_id.is.null` : null
    const applyBranch = (q) => branchOr ? q.or(branchOr) : q

    const [{ data: payments }, { data: manualIncome }, { data: expenses }] = await Promise.all([
      applyBranch(supabase.from('payments').select('amount').eq('status', 'paid')
        .gte('created_at', startDate).lte('created_at', endDate + 'T23:59:59')),
      applyBranch(supabase.from('manual_income').select('amount, vat_amount, payment_method')
        .gte('date', startDate).lte('date', endDate)),
      applyBranch(supabase.from('expenses').select('amount, vat_amount, expense_categories(name, icon)')
        .gte('date', startDate).lte('date', endDate)),
    ])

    // Group income by payment method
    const incMap = {}
    const addInc = (method, amount, vat) => {
      if (!incMap[method]) incMap[method] = { amount: 0, vatAmount: 0, count: 0 }
      incMap[method].amount    += Number(amount || 0)
      incMap[method].vatAmount += Number(vat    || 0)
      incMap[method].count++
    }
    ;(payments ?? []).forEach(p => {
      const amt = Number(p.amount || 0)
      const rate = effectiveVatRate / 100
      const vat  = showVat ? Math.round(amt - amt / (1 + rate)) : 0
      addInc('grow', amt, vat)
    })
    ;(manualIncome ?? []).forEach(m => {
      const amt = Number(m.amount || 0)
      const rate = effectiveVatRate / 100
      const vat  = showVat ? Math.round(amt - amt / (1 + rate)) : 0
      addInc(m.payment_method || 'cash', amt, vat)
    })

    // Group expenses by category
    const expMap = {}
    ;(expenses ?? []).forEach(e => {
      const key  = e.expense_categories?.name || 'אחר'
      const icon = e.expense_categories?.icon || '📦'
      if (!expMap[key]) expMap[key] = { category: key, icon, amount: 0, vatAmount: 0, count: 0 }
      expMap[key].amount    += Number(e.amount || 0)
      expMap[key].vatAmount += Number(e.vat_amount || 0)
      expMap[key].count++
    })

    setIncomeRows(Object.entries(incMap).map(([m, d]) => ({ category: METHOD_LABELS[m] || m, ...d })))
    setExpenseRows(Object.values(expMap).sort((a, b) => b.amount - a.amount))
    setIncomeCount((payments ?? []).length + (manualIncome ?? []).length)
    setExpenseCount((expenses ?? []).length)
    } catch (err) {
      console.error('TaxReportTab fetchData error:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalIncome    = incomeRows.reduce((s, r)  => s + r.amount, 0)
  const totalIncomeVat = incomeRows.reduce((s, r)  => s + r.vatAmount, 0)
  const totalExpenses  = expenseRows.reduce((s, r) => s + r.amount, 0)
  const totalExpVat    = expenseRows.reduce((s, r) => s + r.vatAmount, 0)
  const profit         = totalIncome - totalExpenses
  const netVat         = totalIncomeVat - totalExpVat

  function handleExportCSV() {
    const headers = ['קטגוריה', 'סוג', 'פריטים', 'סכום', ...(showVat ? ['מע"מ'] : [])]
    const rows = [
      ...incomeRows.map(r  => [r.category,              'הכנסה', r.count, r.amount,  ...(showVat ? [r.vatAmount]  : [])]),
      ...expenseRows.map(r => [`${r.icon} ${r.category}`, 'הוצאה', r.count, r.amount, ...(showVat ? [r.vatAmount] : [])]),
      [],
      ['סה"כ הכנסות', '', incomeCount, totalIncome,   ...(showVat ? [totalIncomeVat] : [])],
      ['סה"כ הוצאות', '', expenseCount, totalExpenses, ...(showVat ? [totalExpVat]    : [])],
      ['רווח גולמי',  '', '',           profit],
      ...(showVat ? [['מע"מ לתשלום', '', '', '', netVat]] : []),
    ]
    downloadCSV(headers, rows, `report-${currentPeriod?.startDate}-${currentPeriod?.endDate}.csv`)
    showToast({ message: 'הקובץ הורד בהצלחה', type: 'success' })
  }

  function buildWhatsAppText() {
    const lines = [
      `📊 דוח ריכוז — ${currentPeriod?.label}`,
      '',
      `📈 הכנסות: ${formatILS(totalIncome)} (${incomeCount} פריטים)`,
      `📉 הוצאות: ${formatILS(totalExpenses)} (${expenseCount} פריטים)`,
      `💰 רווח גולמי: ${formatILS(profit)}`,
    ]
    if (showVat) {
      lines.push('', `🧾 מע"מ הכנסות: ${formatILS(totalIncomeVat)}`)
      lines.push(`🧾 מע"מ הוצאות: ${formatILS(totalExpVat)}`)
      lines.push(`⚖️ מע"מ לתשלום: ${formatILS(netVat)}`)
    }
    if (expenseRows.length > 0) {
      lines.push('', 'פירוט הוצאות לפי קטגוריה:')
      expenseRows.forEach(r => lines.push(`${r.icon} ${r.category}: ${formatILS(r.amount)}`))
    }
    return lines.join('\n')
  }

  function sendWhatsApp() {
    const phone = (settings?.accountant_phone || '').replace(/\D/g, '')
    const intl  = phone.startsWith('0') ? `972${phone.slice(1)}` : phone
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(buildWhatsAppText())}`, '_blank')
    setShowAccountant(false)
  }

  async function handleExportOpenFrmt() {
    const from = currentPeriod?.startDate
    const to   = currentPeriod?.endDate
    if (!from || !to) return
    const { valid, errors, warnings } = validateOpenFormatSettings(settings || {})
    setExportWarnings(warnings || [])
    if (!valid) { showToast({ message: errors[0], type: 'error' }); return }
    setExportLoading(true)
    try {
      const { report } = await downloadOpenFormat({ from, to, settings })
      showToast({ message: `קובץ אחיד הופק בהצלחה — ${report.totals.C100} מסמכים`, type: 'success' })
    } catch (err) {
      showToast({ message: err.message, type: 'error' })
    } finally {
      setExportLoading(false)
    }
  }

  function handlePrintSection26() {
    if (!settings) return
    const report = buildSection26Report({
      settings,
      from: currentPeriod?.startDate,
      to:   currentPeriod?.endDate,
      counts: { C100: 0, D110: 0, D120: 0, M100: 0 },
      primaryId: '—',
    })
    printSection26(report)
  }

  async function handleQuarterlyBackup() {
    if (!settings) return
    setExportLoading(true)
    try {
      const fullYear = new Date().getFullYear()
      await downloadOpenFormat({ from: `${fullYear}-01-01`, to: `${fullYear}-12-31`, settings })
      await supabase.functions.invoke('quarterly-backup')
      showToast({ message: 'גיבוי רבעוני הורד — שמור במיקום מאובטח בישראל', type: 'success' })
    } catch (err) {
      showToast({ message: err.message, type: 'error' })
    } finally {
      setExportLoading(false)
    }
  }

  async function handleExportSample() {
    setSampleLoading(true)
    try {
      const { blob, totalRecords } = await generateSampleFiles(500)
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      a.download = 'BOOKX_DEMO_simulator.zip'
      a.click()
      URL.revokeObjectURL(url)
      showToast({ message: `קובץ דמה הופק — ${totalRecords} רשומות`, type: 'success' })
    } catch (err) {
      showToast({ message: err.message, type: 'error' })
    } finally {
      setSampleLoading(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* Period selector */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>שנה</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>סוג תקופה</label>
          <select value={periodType} onChange={e => setPeriodType(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {PERIOD_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>תקופה</label>
          <select value={periodIdx} onChange={e => setPeriodIdx(Number(e.target.value))}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <AdminSkeleton />
      ) : (
        <>
          {/* Stat cards */}
          <div className={`grid gap-3 ${showVat ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <StatCard label="הכנסות סה״כ"  value={totalIncome}    color="#16a34a"             delay={0} />
            <StatCard label="הוצאות סה״כ"  value={totalExpenses}  color="#dc2626"             delay={1} />
            <StatCard label="רווח גולמי"    value={profit}         color={profit >= 0 ? 'var(--color-gold)' : '#dc2626'} delay={2} />
            {showVat && <StatCard label='מע"מ לתשלום' value={netVat} color="var(--color-gold)" delay={3} highlight />}
          </div>

          {/* Income table */}
          <div className="card p-4">
            <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              📈 הכנסות
            </p>
            {incomeRows.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: 'var(--color-muted)' }}>אין הכנסות בתקופה זו</p>
            ) : (
              <div className="space-y-1">
                {incomeRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{row.category}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                        {row.count}
                      </span>
                    </div>
                    <div className="flex gap-4 items-center">
                      {showVat && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>מע"מ {formatILS(row.vatAmount)}</span>}
                      <span className="text-sm font-bold" style={{ color: '#16a34a' }}>{formatILS(row.amount)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>סה"כ</span>
                  <span className="text-sm font-black" style={{ color: '#16a34a' }}>{formatILS(totalIncome)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Expense table */}
          <div className="card p-4">
            <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              📉 הוצאות
            </p>
            {expenseRows.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: 'var(--color-muted)' }}>אין הוצאות בתקופה זו</p>
            ) : (
              <div className="space-y-1">
                {expenseRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{row.icon} {row.category}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                        {row.count}
                      </span>
                    </div>
                    <div className="flex gap-4 items-center">
                      {showVat && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>מע"מ {formatILS(row.vatAmount)}</span>}
                      <span className="text-sm font-bold" style={{ color: '#dc2626' }}>{formatILS(row.amount)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>סה"כ</span>
                  <span className="text-sm font-black" style={{ color: '#dc2626' }}>{formatILS(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>

          {/* VAT section — only for osek morsheh / company */}
          {showVat && (
            <div className="card p-4" style={{ border: '1px solid var(--color-gold-ring)', background: 'var(--color-gold-tint)' }}>
              <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                🧾 דוח מע"מ
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>מע"מ על הכנסות</span>
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{formatILS(totalIncomeVat)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>מע"מ על הוצאות (זיכוי)</span>
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{formatILS(totalExpVat)}</span>
                </div>
                <div className="flex justify-between text-base pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>מע"מ לתשלום</span>
                  <span className="font-black" style={{ color: 'var(--color-gold)' }}>{formatILS(netVat)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => {
                if (!settings?.accountant_name || !settings?.accountant_phone) {
                  showToast({ message: 'הגדר פרטי רואה חשבון בהגדרות הפיננסים', type: 'error' })
                  return
                }
                setShowAccountant(true)
              }}
              className="btn-primary px-5 py-2.5 text-sm"
            >
              📤 שלח לרואה חשבון
            </button>
            <button onClick={handleExportCSV}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              📥 ייצוא CSV
            </button>
          </div>

          {/* OPENFRMT export card */}
          <div className="card p-4" style={{ border: '1px solid var(--color-border)' }}>
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              📁 ייצוא קובץ אחיד — רשות המסים (OPENFRMT 1.31)
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              תקופה: {currentPeriod?.label}
              {settings?.last_openfrmt_export_at && (
                <span className="mr-3">• ייצוא אחרון: {new Date(settings.last_openfrmt_export_at).toLocaleDateString('he-IL')}</span>
              )}
            </p>

            {exportWarnings.length > 0 && (
              <div className="rounded-xl p-3 mb-3 text-xs space-y-1"
                style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', color: '#b45309' }}>
                {exportWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleExportOpenFrmt}
                disabled={exportLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-gold)', color: '#000' }}>
                {exportLoading ? '⏳ מייצא...' : '⬇ ייצא ZIP'}
              </button>
              <button
                onClick={handlePrintSection26}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                🖨 הדפס דוח 2.6
              </button>
              <button
                onClick={handleExportSample}
                disabled={sampleLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                {sampleLoading ? '⏳ מכין...' : '🧪 קובץ דמה לסימולטור'}
              </button>
            </div>
          </div>
          {/* Quarterly backup reminder */}
          {(() => {
            const last = settings?.last_quarterly_backup_at ? new Date(settings.last_quarterly_backup_at) : null
            const daysSince = last ? Math.floor((Date.now() - last) / 86400000) : 999
            if (daysSince <= 90) return null
            return (
              <div className="rounded-2xl p-4 flex items-center justify-between gap-3"
                style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#dc2626' }}>⚠ גיבוי רבעוני נדרש</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    {last ? `גיבוי אחרון לפני ${daysSince} יום` : 'לא בוצע גיבוי מעולם'} — חובה לפי הוראת מקצוע 24/2004
                  </p>
                </div>
                <button onClick={handleQuarterlyBackup} disabled={exportLoading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap disabled:opacity-50"
                  style={{ background: '#dc2626', color: '#fff' }}>
                  {exportLoading ? '⏳...' : '💾 גיבוי עכשיו'}
                </button>
              </div>
            )
          })()}
        </>
      )}

      {/* Accountant modal */}
      <Modal open={showAccountant} onClose={() => setShowAccountant(false)} title="שליחה לרואה חשבון" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{settings?.accountant_name}</p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{settings?.accountant_phone}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>תצוגה מקדימה:</p>
            <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--color-text)', fontFamily: 'inherit', lineHeight: 1.7 }}>
              {buildWhatsAppText()}
            </pre>
          </div>
          <button onClick={sendWhatsApp} className="btn-primary w-full py-3 text-base">
            📲 שלח בWhatsApp
          </button>
        </div>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, color, delay = 0, highlight = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05 }}
      className="rounded-2xl p-4 text-center"
      style={{
        background: highlight ? 'var(--color-gold-tint)' : 'var(--color-card)',
        border: `1px solid ${highlight ? 'var(--color-gold)' : 'var(--color-border)'}`,
      }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>{label}</p>
      <p className="text-xl font-black" style={{ color }}>{formatILS(value)}</p>
    </motion.div>
  )
}
