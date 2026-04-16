import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatILS, getBiMonthlyPeriods, hasVat, downloadCSV } from '../../../lib/finance'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { format } from 'date-fns'

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
  const quarters = [
    { label: `Q1 - ינואר–מרץ ${year}`, months: [1, 3] },
    { label: `Q2 - אפריל–יוני ${year}`, months: [4, 6] },
    { label: `Q3 - יולי–ספטמבר ${year}`, months: [7, 9] },
    { label: `Q4 - אוקטובר–דצמבר ${year}`, months: [10, 12] },
  ]
  return quarters.map(q => {
    const lastDay = new Date(year, q.months[1], 0).getDate()
    return {
      label: q.label,
      startDate: `${year}-${String(q.months[0]).padStart(2, '0')}-01`,
      endDate: `${year}-${String(q.months[1]).padStart(2, '0')}-${lastDay}`,
    }
  })
}

export function TaxReportTab() {
  const showToast = useToast()
  const { settings } = useBusinessSettings()

  const businessType = settings?.business_type || 'osek_morsheh'
  const vatRate = settings?.vat_rate ?? 18
  const isOsekPatur = businessType === 'osek_patur'

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [periodType, setPeriodType] = useState('bi-monthly')
  const [periodIdx, setPeriodIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showAccountant, setShowAccountant] = useState(false)

  // Data
  const [incomeData, setIncomeData] = useState([])
  const [expenseData, setExpenseData] = useState([])

  const periods = useMemo(() => {
    if (periodType === 'monthly') return getMonthlyPeriods(year)
    if (periodType === 'quarterly') return getQuarterlyPeriods(year)
    return getBiMonthlyPeriods(year)
  }, [periodType, year])

  // Auto-select current period when periods change
  useEffect(() => {
    const now = new Date()
    if (year === now.getFullYear()) {
      const month = now.getMonth()
      let idx = 0
      if (periodType === 'monthly') idx = month
      else if (periodType === 'bi-monthly') idx = Math.floor(month / 2)
      else idx = Math.floor(month / 3)
      setPeriodIdx(Math.min(idx, periods.length - 1))
    } else {
      setPeriodIdx(0)
    }
  }, [periodType, year])

  const currentPeriod = periods[periodIdx]

  useEffect(() => {
    if (!currentPeriod) return
    fetchData()
  }, [currentPeriod])

  async function fetchData() {
    setLoading(true)
    const { startDate, endDate } = currentPeriod

    // Fetch paid payments (income)
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, created_at, method')
      .eq('status', 'paid')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59')

    // Fetch manual income entries
    const { data: manualIncome } = await supabase
      .from('manual_income')
      .select('amount, date, description, method')
      .gte('date', startDate)
      .lte('date', endDate)

    // Fetch expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, expense_categories(name, icon)')
      .gte('date', startDate)
      .lte('date', endDate)

    // Summarize income by method (payments + manual_income combined)
    const incomeByMethod = {}

    ;(payments ?? []).forEach(p => {
      const method = p.method || 'other'
      if (!incomeByMethod[method]) incomeByMethod[method] = { amount: 0, count: 0 }
      incomeByMethod[method].amount += Number(p.amount || 0)
      incomeByMethod[method].count++
    })

    ;(manualIncome ?? []).forEach(m => {
      const method = m.method || 'other'
      if (!incomeByMethod[method]) incomeByMethod[method] = { amount: 0, count: 0 }
      incomeByMethod[method].amount += Number(m.amount || 0)
      incomeByMethod[method].count++
    })

    const incomeRows = Object.entries(incomeByMethod).map(([method, data]) => {
      const rate = vatRate / 100
      const vatAmount = isOsekPatur ? 0 : Math.round(data.amount - data.amount / (1 + rate))
      return {
        category: methodLabel(method),
        amount: data.amount,
        vatAmount,
        count: data.count,
      }
    })

    // Summarize expenses by category
    const expByCat = {}
    ;(expenses ?? []).forEach(exp => {
      const catName = exp.expense_categories?.name || 'אחר'
      const catIcon = exp.expense_categories?.icon || '📦'
      const key = catName
      if (!expByCat[key]) expByCat[key] = { category: `${catIcon} ${catName}`, amount: 0, vatAmount: 0, count: 0 }
      expByCat[key].amount += Number(exp.amount || 0)
      expByCat[key].vatAmount += Number(exp.vat_amount || 0)
      expByCat[key].count++
    })

    setIncomeData(incomeRows)
    setExpenseData(Object.values(expByCat))
    setLoading(false)
  }

  function methodLabel(method) {
    const labels = {
      cash: '💵 מזומן',
      credit: '💳 אשראי',
      transfer: '🏦 העברה',
      check: '📄 צ\'ק',
      grow: '🌐 Grow',
      other: '📦 אחר',
    }
    return labels[method] || method
  }

  // Totals
  const totalIncome = incomeData.reduce((s, r) => s + r.amount, 0)
  const totalIncomeVat = incomeData.reduce((s, r) => s + r.vatAmount, 0)
  const totalExpenses = expenseData.reduce((s, r) => s + r.amount, 0)
  const totalExpenseVat = expenseData.reduce((s, r) => s + r.vatAmount, 0)
  const netVat = totalIncomeVat - totalExpenseVat
  const grossProfit = totalIncome - totalExpenses

  function handleExportCSV() {
    const headers = ['קטגוריה', 'סוג', 'סכום', 'מע"מ']
    const rows = [
      ...incomeData.map(r => [r.category, 'הכנסה', r.amount, r.vatAmount]),
      ...expenseData.map(r => [r.category, 'הוצאה', r.amount, r.vatAmount]),
      [],
      ['סה"כ הכנסות', '', totalIncome, totalIncomeVat],
      ['סה"כ הוצאות', '', totalExpenses, totalExpenseVat],
      ['רווח גולמי', '', grossProfit, ''],
      ...(!isOsekPatur ? [['מע"מ לתשלום', '', netVat, '']] : []),
    ]
    downloadCSV(headers, rows, `report-${currentPeriod?.startDate}-${currentPeriod?.endDate}.csv`)
    showToast({ message: 'הקובץ הורד בהצלחה', type: 'success' })
  }

  function handleSendAccountant() {
    const name = settings?.accountant_name
    const phone = settings?.accountant_phone

    if (!name || !phone) {
      showToast({ message: 'הגדר פרטי רואה חשבון בהגדרות', type: 'error' })
      return
    }

    setShowAccountant(true)
  }

  function buildWhatsAppText() {
    const totalIncomeCount = incomeData.reduce((s, r) => s + r.count, 0)
    const totalExpenseCount = expenseData.reduce((s, r) => s + r.count, 0)

    let text = `דוח ריכוז — ${currentPeriod?.label}\n\n`
    text += `📈 הכנסות: ${formatILS(totalIncome)} (${totalIncomeCount} פריטים)\n`
    text += `📉 הוצאות: ${formatILS(totalExpenses)} (${totalExpenseCount} פריטים)\n`
    text += `💰 רווח: ${formatILS(grossProfit)}\n`

    if (!isOsekPatur) {
      text += `\n🧾 מע"מ הכנסות: ${formatILS(totalIncomeVat)}\n`
      text += `🧾 מע"מ הוצאות: ${formatILS(totalExpenseVat)}\n`
      text += `⚖️ מע"מ לתשלום: ${formatILS(netVat)}\n`
    }

    if (expenseData.length > 0) {
      text += `\nפירוט הוצאות לפי קטגוריה:\n`
      expenseData.forEach(row => {
        text += `${row.category}: ${formatILS(row.amount)}\n`
      })
    }

    return text
  }

  function sendWhatsAppToAccountant() {
    const phone = (settings?.accountant_phone || '').replace(/\D/g, '')
    const intlPhone = phone.startsWith('0') ? `972${phone.slice(1)}` : phone
    const text = encodeURIComponent(buildWhatsAppText())
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank')
    setShowAccountant(false)
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>שנה</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>סוג תקופה</label>
          <select
            value={periodType}
            onChange={e => setPeriodType(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {PERIOD_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>תקופה</label>
          <select
            value={periodIdx}
            onChange={e => setPeriodIdx(Number(e.target.value))}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {periods.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* 4 stat cards in 2×2 grid (VAT card hidden for osek_patur) */}
          <div className={`grid gap-3 ${isOsekPatur ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
            <StatCard
              label="סה״כ הכנסות"
              value={totalIncome}
              delay={0}
              color="#22c55e"
            />
            <StatCard
              label="סה״כ הוצאות"
              value={totalExpenses}
              delay={1}
              color="#ef4444"
            />
            <StatCard
              label="רווח גולמי"
              value={grossProfit}
              delay={2}
              color={grossProfit >= 0 ? 'var(--color-gold)' : '#ef4444'}
              highlight={grossProfit >= 0}
            />
            {!isOsekPatur && (
              <StatCard
                label='מע"מ לתשלום'
                value={netVat}
                delay={3}
                color="var(--color-gold)"
                highlight
              />
            )}
          </div>

          {/* Income breakdown */}
          <div className="card p-4">
            <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              📈 הכנסות
            </p>
            {incomeData.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: 'var(--color-muted)' }}>אין הכנסות בתקופה זו</p>
            ) : (
              <div className="space-y-1">
                {incomeData.map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{row.category}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                        {row.count} פריטים
                      </span>
                    </div>
                    <div className="flex gap-4 items-center">
                      {!isOsekPatur && (
                        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                          מע"מ {formatILS(row.vatAmount)}
                        </span>
                      )}
                      <span className="text-sm font-bold" style={{ color: '#22c55e' }}>
                        {formatILS(row.amount)}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>סה"כ</span>
                  <div className="flex gap-4 items-center">
                    {!isOsekPatur && (
                      <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                        מע"מ {formatILS(totalIncomeVat)}
                      </span>
                    )}
                    <span className="text-sm font-black" style={{ color: '#22c55e' }}>
                      {formatILS(totalIncome)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expense breakdown */}
          <div className="card p-4">
            <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              📉 הוצאות
            </p>
            {expenseData.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: 'var(--color-muted)' }}>אין הוצאות בתקופה זו</p>
            ) : (
              <div className="space-y-1">
                {expenseData.map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{row.category}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                        {row.count} פריטים
                      </span>
                    </div>
                    <div className="flex gap-4 items-center">
                      {!isOsekPatur && (
                        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                          מע"מ {formatILS(row.vatAmount)}
                        </span>
                      )}
                      <span className="text-sm font-bold" style={{ color: '#ef4444' }}>
                        {formatILS(row.amount)}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>סה"כ</span>
                  <div className="flex gap-4 items-center">
                    {!isOsekPatur && (
                      <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                        מע"מ {formatILS(totalExpenseVat)}
                      </span>
                    )}
                    <span className="text-sm font-black" style={{ color: '#ef4444' }}>
                      {formatILS(totalExpenses)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* VAT section — osek_morsheh / company only */}
          {!isOsekPatur && (
            <div
              className="card p-4"
              style={{ border: '1px solid rgba(201,169,110,0.3)', background: 'rgba(201,169,110,0.04)' }}
            >
              <p className="font-bold text-sm mb-3" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
                🧾 מע"מ
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>מע"מ הכנסות</span>
                  <span style={{ color: 'var(--color-text)' }}>{formatILS(totalIncomeVat)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--color-muted)' }}>מע"מ הוצאות (תשומות)</span>
                  <span style={{ color: 'var(--color-text)' }}>{formatILS(totalExpenseVat)}</span>
                </div>
                <div
                  className="flex justify-between text-sm font-bold pt-2 mt-2 border-t"
                  style={{ borderColor: 'rgba(201,169,110,0.3)' }}
                >
                  <span style={{ color: 'var(--color-gold)' }}>מע"מ לתשלום</span>
                  <span style={{ color: 'var(--color-gold)' }}>{formatILS(netVat)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleSendAccountant}
              className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2"
            >
              📤 שלח לרואה חשבון
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              📥 ייצוא CSV
            </button>
          </div>
        </>
      )}

      {/* Accountant Modal */}
      <Modal open={showAccountant} onClose={() => setShowAccountant(false)} title="שליחה לרואה חשבון" size="sm">
        <div className="space-y-4">
          {!settings?.accountant_name || !settings?.accountant_phone ? (
            <div className="text-center py-6">
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                הגדר פרטי רואה חשבון בהגדרות הפיננסיות
              </p>
            </div>
          ) : (
            <>
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {settings.accountant_name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {settings.accountant_phone}
                </p>
              </div>

              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>תצוגה מקדימה של ההודעה:</p>
                <pre
                  className="text-xs whitespace-pre-wrap"
                  style={{ color: 'var(--color-text)', fontFamily: 'inherit', direction: 'rtl' }}
                >
                  {buildWhatsAppText()}
                </pre>
              </div>

              <button
                onClick={sendWhatsAppToAccountant}
                className="btn-primary w-full py-3 text-base"
              >
                📤 שלח בWhatsApp
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, delay = 0, highlight = false, color }) {
  const textColor = color || (highlight ? 'var(--color-gold)' : 'var(--color-text)')
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05 }}
      className="rounded-2xl p-4 text-center"
      style={{
        background: highlight ? 'rgba(201,169,110,0.08)' : 'var(--color-card)',
        border: `1px solid ${highlight ? 'var(--color-gold)' : 'var(--color-border)'}`,
      }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>{label}</p>
      <p className="text-xl font-black" style={{ color: textColor }}>
        {formatILS(value)}
      </p>
    </motion.div>
  )
}
