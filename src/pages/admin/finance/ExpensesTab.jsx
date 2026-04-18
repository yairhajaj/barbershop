import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale/he'
import { useExpenses } from '../../../hooks/useExpenses'
import { useBranch } from '../../../contexts/BranchContext'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatILS, calcVat, PAYMENT_METHODS, downloadCSV, hasVat } from '../../../lib/finance'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { useConfirm } from '../../../components/ui/ConfirmDialog'
import { Spinner } from '../../../components/ui/Spinner'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'
import { ImageUpload } from '../../../components/ui/ImageUpload'

const CATEGORY_COLORS = [
  '#c9a96e', '#dc2626', '#2563eb', '#16a34a', '#7c3aed',
  '#d97706', '#0ea5e9', '#e11d48', '#84cc16', '#f97316',
]

export function ExpensesTab() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { settings } = useBusinessSettings()
  const { currentBranch } = useBranch()

  const now = new Date()
  const [monthFilter, setMonthFilter] = useState(format(now, 'yyyy-MM'))
  const [catFilter, setCatFilter] = useState('all')

  const filterStart = monthFilter + '-01'
  const filterEnd = format(endOfMonth(new Date(monthFilter + '-01')), 'yyyy-MM-dd')

  const {
    expenses,
    categories,
    loading,
    createExpense,
    deleteExpense,
  } = useExpenses({
    startDate: filterStart,
    endDate: filterEnd,
    categoryId: catFilter !== 'all' ? catFilter : undefined,
    branchId: currentBranch?.id ?? null,
  })

  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  )

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map = {}
    expenses.forEach(e => {
      const catId = e.category_id || 'uncategorized'
      const catName = e.expense_categories?.name || '\u05DC\u05DC\u05D0 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'
      const catIcon = e.expense_categories?.icon || '\u{1F4C1}'
      if (!map[catId]) map[catId] = { id: catId, name: catName, icon: catIcon, total: 0 }
      map[catId].total += Number(e.amount)
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [expenses])

  const barTotal = categoryBreakdown.reduce((s, c) => s + c.total, 0) || 1

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vendor_name: '',
    description: '',
    amount: '',
    vat_amount: '',
    date: format(now, 'yyyy-MM-dd'),
    category_id: '',
    payment_method: 'cash',
    receipt_url: '',
    notes: '',
  })

  // Receipt preview modal
  const [receiptUrl, setReceiptUrl] = useState(null)

  // Delete confirm
  const [deleting, setDeleting] = useState(null)

  function resetForm() {
    setForm({
      vendor_name: '',
      description: '',
      amount: '',
      vat_amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      category_id: '',
      payment_method: 'cash',
      receipt_url: '',
      notes: '',
    })
  }

  // Auto-calc VAT when amount changes
  function handleAmountChange(val) {
    const newForm = { ...form, amount: val }
    if (hasVat(settings?.business_type) && val) {
      const vat = calcVat(Number(val), settings?.vat_rate, settings?.business_type)
      newForm.vat_amount = String(vat.vatAmount)
    }
    setForm(newForm)
  }

  async function handleSave() {
    if (!form.amount) {
      showToast({ message: '\u05E0\u05D0 \u05DC\u05DE\u05DC\u05D0 \u05E1\u05DB\u05D5\u05DD', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const entry = {
        vendor_name: form.vendor_name || null,
        description: form.description || null,
        amount: Number(form.amount),
        vat_amount: form.vat_amount ? Number(form.vat_amount) : 0,
        date: form.date,
        category_id: form.category_id || null,
        payment_method: form.payment_method,
        receipt_url: form.receipt_url || null,
        notes: form.notes || null,
      }
      await createExpense(entry)
      showToast({ message: '\u05D4\u05D5\u05E6\u05D0\u05D4 \u05E0\u05D5\u05E1\u05E4\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4', type: 'success' })
      setModalOpen(false)
      resetForm()
    } catch (err) {
      showToast({ message: '\u05E9\u05D2\u05D9\u05D0\u05D4: ' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!await confirm({ title: 'מחיקת הוצאה', description: 'האם אתה בטוח שברצונך למחוק את ההוצאה? פעולה זו אינה הפיכה.', variant: 'destructive', confirmLabel: 'מחק' })) return
    setDeleting(id)
    try {
      await deleteExpense(id)
      showToast({ message: '\u05D4\u05D5\u05E6\u05D0\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4', type: 'success' })
    } catch (err) {
      showToast({ message: '\u05E9\u05D2\u05D9\u05D0\u05D4: ' + err.message, type: 'error' })
    } finally {
      setDeleting(null)
    }
  }

  function handleExportCSV() {
    const headers = ['\u05EA\u05D0\u05E8\u05D9\u05DA', '\u05E1\u05E4\u05E7', '\u05EA\u05D9\u05D0\u05D5\u05E8', '\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4', '\u05D0\u05DE\u05E6\u05E2\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD', '\u05E1\u05DB\u05D5\u05DD', '\u05DE\u05E2"\u05DE']
    const rows = expenses.map(e => {
      let dateStr = ''
      try { dateStr = format(new Date(e.date), 'dd/MM/yyyy') } catch { dateStr = '' }
      return [
        dateStr,
        e.vendor_name || '',
        e.description || '',
        e.expense_categories?.name || '',
        PAYMENT_METHODS[e.payment_method] || e.payment_method || '',
        e.amount,
        e.vat_amount || 0,
      ]
    })
    downloadCSV(headers, rows, `expenses_${monthFilter}.csv`)
    showToast({ message: 'CSV \u05D9\u05D5\u05E6\u05D0 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4', type: 'success' })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              {'\u05D7\u05D5\u05D3\u05E9'}
            </label>
            <input
              type="month"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="input-field text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              {'\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'}
            </label>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="input-field text-sm"
            >
              <option value="all">{'\u05D4\u05DB\u05DC'}</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Category breakdown bar */}
      {categoryBreakdown.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4"
        >
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
          >
            {'\u05E4\u05D9\u05DC\u05D5\u05D7 \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'}
          </h3>

          {/* Stacked bar */}
          <div className="flex rounded-lg overflow-hidden h-6 mb-3">
            {categoryBreakdown.map((cat, i) => (
              <div
                key={cat.id}
                title={`${cat.name}: ${formatILS(cat.total)}`}
                style={{
                  width: `${(cat.total / barTotal) * 100}%`,
                  background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                  minWidth: '4px',
                }}
              />
            ))}
          </div>

          {/* Labels */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {categoryBreakdown.map((cat, i) => (
              <div key={cat.id} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded"
                  style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                />
                <span>{cat.icon} {cat.name}</span>
                <span className="font-bold" style={{ color: 'var(--color-text)' }}>
                  {formatILS(cat.total)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setModalOpen(true)} className="btn-primary text-sm px-4 py-2">
          + {'\u05D4\u05D5\u05E1\u05E3 \u05D4\u05D5\u05E6\u05D0\u05D4'}
        </button>
        <button onClick={handleExportCSV} className="btn-outline text-sm px-4 py-2">
          {'\u{1F4E5}'} {'\u05D9\u05D9\u05E6\u05D5\u05D0 CSV'}
        </button>
      </div>

      {/* Expense list */}
      {loading ? (
        <AdminSkeleton />
      ) : expenses.length === 0 ? (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-4">{'\u{1F4B8}'}</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
            {'\u05D0\u05D9\u05DF \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05D1\u05EA\u05E7\u05D5\u05E4\u05D4'}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {'\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05E9\u05EA\u05D5\u05E1\u05D9\u05E3 \u05D9\u05D5\u05E4\u05D9\u05E2\u05D5 \u05DB\u05D0\u05DF'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {expenses.map((expense, i) => {
            let formattedDate = ''
            try {
              formattedDate = format(new Date(expense.date), 'dd/MM/yy', { locale: he })
            } catch {
              formattedDate = ''
            }

            return (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg">
                        {expense.expense_categories?.icon || '\u{1F4C1}'}
                      </span>
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        {expense.expense_categories?.name || '\u05DC\u05DC\u05D0 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'}
                      </span>
                    </div>
                    {expense.vendor_name && (
                      <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {expense.vendor_name}
                      </p>
                    )}
                    {expense.description && (
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {expense.description}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                      {formattedDate}
                      {expense.payment_method && (
                        <> &middot; {PAYMENT_METHODS[expense.payment_method] || expense.payment_method}</>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="font-black text-lg" style={{ color: '#dc2626' }}>
                      {formatILS(expense.amount)}
                    </span>
                    <div className="flex items-center gap-2">
                      {expense.receipt_url && (
                        <button
                          onClick={() => setReceiptUrl(expense.receipt_url)}
                          className="w-10 h-10 rounded-lg overflow-hidden border flex-shrink-0"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <img
                            src={expense.receipt_url}
                            alt={'\u05E7\u05D1\u05DC\u05D4'}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(expense.id)}
                        disabled={deleting === expense.id}
                        className="text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{
                          border: '1px solid var(--color-danger-ring)',
                          color: '#dc2626',
                        }}
                      >
                        {deleting === expense.id ? <Spinner size="sm" /> : '\u05DE\u05D7\u05E7'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Totals bar */}
      <div className="card p-4 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {'\u05E1\u05D4"\u05DB \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05D1\u05EA\u05E7\u05D5\u05E4\u05D4'}
        </span>
        <span className="text-xl font-black" style={{ color: '#dc2626' }}>
          {formatILS(totalExpenses)}
        </span>
      </div>

      {/* Add expense modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={'\u05D4\u05D5\u05E1\u05E4\u05EA \u05D4\u05D5\u05E6\u05D0\u05D4'}>
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05E1\u05E4\u05E7'}
            </label>
            <input
              type="text"
              value={form.vendor_name}
              onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
              className="input-field"
              placeholder={'\u05E9\u05DD \u05D4\u05E1\u05E4\u05E7'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05EA\u05D9\u05D0\u05D5\u05E8'}
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="input-field"
              placeholder={'\u05EA\u05D9\u05D0\u05D5\u05E8 \u05D4\u05D4\u05D5\u05E6\u05D0\u05D4'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {'\u05E1\u05DB\u05D5\u05DD (\u20AA)'} *
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="input-field"
                min="0"
                step="1"
                placeholder="0"
              />
            </div>
            {hasVat(settings?.business_type) && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {'\u05DE\u05E2"\u05DE (\u20AA)'}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.vat_amount}
                  onChange={e => setForm(f => ({ ...f, vat_amount: e.target.value }))}
                  className="input-field"
                  min="0"
                  step="1"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {'\u05EA\u05D0\u05E8\u05D9\u05DA'}
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {'\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4'}
              </label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="input-field"
              >
                <option value="">{'\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8\u05D4'}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05D0\u05DE\u05E6\u05E2\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD'}
            </label>
            <select
              value={form.payment_method}
              onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
              className="input-field"
            >
              {Object.entries(PAYMENT_METHODS).filter(([k]) => k !== 'grow').map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05E7\u05D1\u05DC\u05D4'}
            </label>
            <ImageUpload
              value={form.receipt_url}
              onUrl={url => setForm(f => ({ ...f, receipt_url: url }))}
              folder="receipts"
              label={'\u05D4\u05E2\u05DC\u05D0\u05EA \u05E7\u05D1\u05DC\u05D4'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05D4\u05E2\u05E8\u05D5\u05EA'}
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input-field"
              rows={2}
              placeholder={'\u05D4\u05E2\u05E8\u05D5\u05EA \u05E0\u05D5\u05E1\u05E4\u05D5\u05EA'}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-3 text-base"
          >
            {saving ? '\u05E9\u05D5\u05DE\u05E8...' : '\u05E9\u05DE\u05D5\u05E8'}
          </button>
        </div>
      </Modal>

      {/* Receipt preview modal */}
      <Modal open={!!receiptUrl} onClose={() => setReceiptUrl(null)} title={'\u05E7\u05D1\u05DC\u05D4'} size="lg">
        {receiptUrl && (
          <div className="flex justify-center">
            <img
              src={receiptUrl}
              alt={'\u05E7\u05D1\u05DC\u05D4'}
              className="max-w-full max-h-[70vh] rounded-xl object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
