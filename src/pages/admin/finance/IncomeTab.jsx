import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'
import { supabase } from '../../../lib/supabase'
import { useManualIncome } from '../../../hooks/useManualIncome'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useStaff } from '../../../hooks/useStaff'
import { useServices } from '../../../hooks/useServices'
import { formatILS, calcVat, PAYMENT_METHODS, downloadCSV, hasVat } from '../../../lib/finance'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'

const METHOD_BADGE_COLORS = {
  cash:     { bg: 'rgba(22,163,74,0.08)',  color: '#16a34a', border: 'rgba(22,163,74,0.2)' },
  credit:   { bg: 'rgba(37,99,235,0.08)',  color: '#2563eb', border: 'rgba(37,99,235,0.2)' },
  transfer: { bg: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
  check:    { bg: 'rgba(217,119,6,0.08)',  color: '#d97706', border: 'rgba(217,119,6,0.2)' },
  grow:     { bg: 'rgba(14,165,233,0.08)', color: '#0ea5e9', border: 'rgba(14,165,233,0.2)' },
}

export function IncomeTab() {
  const showToast = useToast()
  const { settings } = useBusinessSettings()
  const { staff } = useStaff()
  const { services } = useServices()

  const now = new Date()
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'))
  const [methodFilter, setMethodFilter] = useState('all')

  const { income: manualIncome, loading: manualLoading, createIncome } = useManualIncome({
    startDate,
    endDate,
  })

  // Payments from Supabase
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)

  useEffect(() => {
    fetchPayments()
  }, [startDate, endDate])

  async function fetchPayments() {
    setPaymentsLoading(true)
    const { data } = await supabase
      .from('payments')
      .select('*, appointments(start_at, services(name, price), profiles:customer_id(name, phone))')
      .eq('status', 'paid')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59')
      .order('created_at', { ascending: false })
    setPayments(data ?? [])
    setPaymentsLoading(false)
  }

  // Merge and sort
  const combined = useMemo(() => {
    const items = [
      ...payments.map(p => ({
        id: p.id,
        source: 'payment',
        date: p.created_at,
        description: p.appointments?.services?.name || '\u05EA\u05E9\u05DC\u05D5\u05DD',
        customerName: p.appointments?.profiles?.name || '',
        paymentMethod: p.payment_method || 'credit',
        amount: Number(p.amount),
      })),
      ...manualIncome.map(m => ({
        id: m.id,
        source: 'manual',
        date: m.date || m.created_at,
        description: m.description,
        customerName: m.customer_name || '',
        paymentMethod: m.payment_method || 'cash',
        amount: Number(m.amount),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))

    if (methodFilter !== 'all') {
      return items.filter(i => i.paymentMethod === methodFilter)
    }
    return items
  }, [payments, manualIncome, methodFilter])

  const totalIncome = combined.reduce((s, i) => s + i.amount, 0)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: format(now, 'yyyy-MM-dd'),
    payment_method: 'cash',
    customer_name: '',
    staff_id: '',
    service_id: '',
    notes: '',
  })

  function resetForm() {
    setForm({
      description: '',
      amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'cash',
      customer_name: '',
      staff_id: '',
      service_id: '',
      notes: '',
    })
  }

  async function handleSave() {
    if (!form.description || !form.amount) {
      showToast({ message: '\u05E0\u05D0 \u05DC\u05DE\u05DC\u05D0 \u05EA\u05D9\u05D0\u05D5\u05E8 \u05D5\u05E1\u05DB\u05D5\u05DD', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const entry = {
        description: form.description,
        amount: Number(form.amount),
        date: form.date,
        payment_method: form.payment_method,
        customer_name: form.customer_name || null,
        staff_id: form.staff_id || null,
        service_id: form.service_id || null,
        notes: form.notes || null,
      }

      if (hasVat(settings?.business_type)) {
        const vat = calcVat(Number(form.amount), settings?.vat_rate, settings?.business_type)
        entry.vat_amount = vat.vatAmount
      }

      await createIncome(entry)
      await fetchPayments()
      showToast({ message: '\u05D4\u05DB\u05E0\u05E1\u05D4 \u05E0\u05D5\u05E1\u05E4\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4', type: 'success' })
      setModalOpen(false)
      resetForm()
    } catch (err) {
      showToast({ message: '\u05E9\u05D2\u05D9\u05D0\u05D4: ' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleExportCSV() {
    const headers = ['\u05EA\u05D0\u05E8\u05D9\u05DA', '\u05EA\u05D9\u05D0\u05D5\u05E8', '\u05DC\u05E7\u05D5\u05D7', '\u05D0\u05DE\u05E6\u05E2\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD', '\u05E1\u05DB\u05D5\u05DD', '\u05DE\u05E7\u05D5\u05E8']
    const rows = combined.map(i => {
      let dateStr = ''
      try { dateStr = format(new Date(i.date), 'dd/MM/yyyy') } catch { dateStr = '' }
      return [
        dateStr,
        i.description,
        i.customerName,
        PAYMENT_METHODS[i.paymentMethod] || i.paymentMethod,
        i.amount,
        i.source === 'payment' ? '\u05E1\u05DC\u05D9\u05E7\u05D4' : '\u05D9\u05D3\u05E0\u05D9',
      ]
    })
    downloadCSV(headers, rows, `income_${startDate}_${endDate}.csv`)
    showToast({ message: 'CSV \u05D9\u05D5\u05E6\u05D0 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4', type: 'success' })
  }

  const loading = manualLoading || paymentsLoading

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              {'\u05DE\u05EA\u05D0\u05E8\u05D9\u05DA'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input-field text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              {'\u05E2\u05D3 \u05EA\u05D0\u05E8\u05D9\u05DA'}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="input-field text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
              {'\u05D0\u05DE\u05E6\u05E2\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD'}
            </label>
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="input-field text-sm"
            >
              <option value="all">{'\u05D4\u05DB\u05DC'}</option>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="card p-4 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {'\u05E1\u05D4"\u05DB \u05D4\u05DB\u05E0\u05E1\u05D5\u05EA \u05D1\u05EA\u05E7\u05D5\u05E4\u05D4'}
        </span>
        <span className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
          {formatILS(totalIncome)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setModalOpen(true)} className="btn-primary text-sm px-4 py-2">
          + {'\u05D4\u05D5\u05E1\u05E3 \u05D4\u05DB\u05E0\u05E1\u05D4 \u05D9\u05D3\u05E0\u05D9\u05EA'}
        </button>
        <button onClick={handleExportCSV} className="btn-outline text-sm px-4 py-2">
          {'\u{1F4E5}'} {'\u05D9\u05D9\u05E6\u05D5\u05D0 CSV'}
        </button>
      </div>

      {/* Income list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : combined.length === 0 ? (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-4">{'\u{1F4B0}'}</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
            {'\u05D0\u05D9\u05DF \u05D4\u05DB\u05E0\u05E1\u05D5\u05EA \u05D1\u05EA\u05E7\u05D5\u05E4\u05D4'}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {'\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA \u05DE\u05EA\u05E9\u05DC\u05D5\u05DE\u05D9\u05DD \u05D5\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA \u05D9\u05D3\u05E0\u05D9\u05D5\u05EA \u05D9\u05D5\u05E4\u05D9\u05E2\u05D5 \u05DB\u05D0\u05DF'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {combined.map((item, i) => {
            let formattedDate = ''
            try {
              formattedDate = format(new Date(item.date), 'dd/MM/yy', { locale: he })
            } catch {
              formattedDate = ''
            }
            const methodStyle = METHOD_BADGE_COLORS[item.paymentMethod] || METHOD_BADGE_COLORS.cash

            return (
              <motion.div
                key={`${item.source}-${item.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="card p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {item.description}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: methodStyle.bg,
                        color: methodStyle.color,
                        border: `1px solid ${methodStyle.border}`,
                      }}
                    >
                      {PAYMENT_METHODS[item.paymentMethod] || item.paymentMethod}
                    </span>
                  </div>
                  <div
                    className="text-xs mt-0.5 flex gap-x-3 flex-wrap"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <span>{formattedDate}</span>
                    {item.customerName && <span>{item.customerName}</span>}
                    <span
                      className="text-xs"
                      style={{ color: item.source === 'payment' ? '#2563eb' : 'var(--color-muted)' }}
                    >
                      {item.source === 'payment' ? '\u05E1\u05DC\u05D9\u05E7\u05D4' : '\u05D9\u05D3\u05E0\u05D9'}
                    </span>
                  </div>
                </div>
                <span className="font-black text-lg flex-shrink-0" style={{ color: '#16a34a' }}>
                  {formatILS(item.amount)}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add manual income modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={'\u05D4\u05D5\u05E1\u05E4\u05EA \u05D4\u05DB\u05E0\u05E1\u05D4 \u05D9\u05D3\u05E0\u05D9\u05EA'}>
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05EA\u05D9\u05D0\u05D5\u05E8'} *
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="input-field"
              placeholder={'\u05EA\u05D9\u05D0\u05D5\u05E8 \u05D4\u05D4\u05DB\u05E0\u05E1\u05D4'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05E1\u05DB\u05D5\u05DD (\u20AA)'} *
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="input-field"
              min="0"
              step="1"
              placeholder="0"
            />
            {hasVat(settings?.business_type) && form.amount > 0 && (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {'\u05DE\u05E2"\u05DE: '}{formatILS(calcVat(Number(form.amount), settings?.vat_rate, settings?.business_type).vatAmount)}
              </p>
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
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {'\u05E9\u05DD \u05DC\u05E7\u05D5\u05D7'}
            </label>
            <input
              type="text"
              value={form.customer_name}
              onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
              className="input-field"
              placeholder={'\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {'\u05E1\u05E4\u05E8'}
              </label>
              <select
                value={form.staff_id}
                onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                className="input-field"
              >
                <option value="">{'\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8'}</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {'\u05E9\u05D9\u05E8\u05D5\u05EA'}
              </label>
              <select
                value={form.service_id}
                onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}
                className="input-field"
              >
                <option value="">{'\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8'}</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
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
    </div>
  )
}
