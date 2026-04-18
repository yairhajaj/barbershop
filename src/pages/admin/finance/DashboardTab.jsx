import { motion } from 'framer-motion'
import { ResponsiveTable } from '../../../components/ui/ResponsiveTable'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFinanceDashboard } from '../../../hooks/useFinanceDashboard'
import { useBranch } from '../../../contexts/BranchContext'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useStaffCommissions } from '../../../hooks/useStaffCommissions'
import { useServices } from '../../../hooks/useServices'
import { formatILS, calcVat, hasVat, PAYMENT_METHODS } from '../../../lib/finance'
import { Spinner } from '../../../components/ui/Spinner'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'
import { useToast } from '../../../components/ui/Toast'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale/he'
import { supabase } from '../../../lib/supabase'

// ─────────────────────────────────────────────
// Quick Receipt Panel
// ─────────────────────────────────────────────
function QuickReceiptPanel() {
  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null
  const { settings } = useBusinessSettings()
  const { services } = useServices({ activeOnly: true })
  const showToast = useToast()
  const qc = useQueryClient()

  const [topServices, setTopServices] = useState([])
  const [products, setProducts] = useState([])
  const [productsOpen, setProductsOpen] = useState(false)

  // form
  const [selectedItem, setSelectedItem] = useState(null) // { type, id, name, price }
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [isDebt, setIsDebt] = useState(false)

  // customer
  const [customerMode, setCustomerMode] = useState('walkin') // 'walkin' | 'search'
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [searching, setSearching] = useState(false)

  const [saving, setSaving] = useState(false)

  // load top services sorted by usage frequency
  useEffect(() => {
    if (!services.length) return
    async function load() {
      const { data } = await supabase
        .from('appointments')
        .select('service_id')
        .not('service_id', 'is', null)
      const freq = {}
      ;(data ?? []).forEach(a => { freq[a.service_id] = (freq[a.service_id] ?? 0) + 1 })
      setTopServices(
        [...services]
          .sort((a, b) => (freq[b.id] ?? 0) - (freq[a.id] ?? 0))
          .slice(0, 8)
      )
    }
    load()
  }, [services])

  // load active products
  useEffect(() => {
    supabase.from('products').select('id, name, price').eq('is_active', true)
      .order('display_order').then(({ data }) => setProducts(data ?? []))
  }, [])

  // customer search (debounced)
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) {
      setCustomerResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .eq('role', 'customer')
        .or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(6)
      setCustomerResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  function pickService(svc) {
    setSelectedItem({ type: 'service', id: svc.id, name: svc.name, price: svc.price })
    setAmount(String(svc.price ?? ''))
    setDescription(svc.name)
  }

  function pickProduct(prod) {
    setSelectedItem({ type: 'product', id: prod.id, name: prod.name, price: prod.price })
    setAmount(String(prod.price ?? ''))
    setDescription(prod.name)
    setProductsOpen(false)
  }

  function pickCustomer(c) {
    setSelectedCustomer(c)
    setCustomerSearch('')
    setCustomerResults([])
  }

  function resetForm() {
    setSelectedItem(null)
    setAmount('')
    setDescription('')
    setSelectedCustomer(null)
    setCustomerMode('walkin')
    setIsDebt(false)
    setPayMethod('cash')
  }

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      showToast({ message: 'נא להזין סכום', type: 'error' })
      return
    }
    if (!description.trim()) {
      showToast({ message: 'נא לבחור שירות, מוצר, או להזין תיאור', type: 'error' })
      return
    }
    if (isDebt && !selectedCustomer) {
      showToast({ message: 'לחוב נדרש לקוח רשום', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const amountNum = Number(amount)
      if (isDebt) {
        const { error } = await supabase.from('customer_debts').insert({
          customer_id: selectedCustomer.id,
          amount: amountNum,
          description: description.trim(),
          status: 'pending',
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['customer_debts'] })
        showToast({ message: 'חוב נרשם ללקוח ✓', type: 'success' })
      } else {
        const entry = {
          description: description.trim(),
          amount: amountNum,
          date: format(new Date(), 'yyyy-MM-dd'),
          payment_method: payMethod,
          customer_name: selectedCustomer?.name ?? null,
          service_id: selectedItem?.type === 'service' ? selectedItem.id : null,
          branch_id: branchId,
        }
        if (hasVat(settings?.business_type)) {
          entry.vat_amount = calcVat(amountNum, settings?.vat_rate, settings?.business_type).vatAmount
        }
        const { error } = await supabase.from('manual_income').insert(entry)
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['manual_income'] })
        qc.invalidateQueries({ queryKey: ['finance'] })
        showToast({ message: 'תקבול נרשם ✓', type: 'success' })
      }
      resetForm()
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const payMethods = [
    { k: 'cash', label: '💵 מזומן' },
    { k: 'bit', label: '📱 ביט' },
    { k: 'credit', label: '💳 אשראי' },
    { k: 'paybox', label: '📦 Paybox' },
    { k: 'transfer', label: '🏦 העברה' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="card p-4 space-y-4"
    >
      <h2 className="font-bold text-base" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        ⚡ תקבול מהיר
      </h2>

      {/* Top services */}
      {topServices.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>שירות</p>
          <div className="flex flex-wrap gap-2">
            {topServices.map(svc => (
              <button
                key={svc.id}
                onClick={() => pickService(svc)}
                className="text-xs px-3 py-2 rounded-xl font-medium transition-all border"
                style={
                  selectedItem?.id === svc.id && selectedItem?.type === 'service'
                    ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface)' }
                }
              >
                {svc.name} — ₪{svc.price}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products (collapsible) */}
      <div>
        <button
          onClick={() => setProductsOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--color-muted)' }}
        >
          📦 מוצרים
          <span className="text-[10px]">{productsOpen ? '▲' : '▼'}</span>
        </button>
        {productsOpen && (
          <div
            className="mt-2 max-h-44 overflow-y-auto rounded-xl border p-1.5 space-y-0.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {products.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--color-muted)' }}>אין מוצרים</p>
            ) : products.map(p => (
              <button
                key={p.id}
                onClick={() => pickProduct(p)}
                className="w-full text-right px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors"
                style={
                  selectedItem?.id === p.id && selectedItem?.type === 'product'
                    ? { background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }
                    : { color: 'var(--color-text)' }
                }
              >
                <span>{p.name}</span>
                <span className="font-bold text-xs" style={{ color: 'var(--color-gold)' }}>₪{p.price}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description + amount */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-muted)' }}>תיאור</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="input-field text-sm w-full"
            placeholder="שם שירות / מוצר"
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-muted)' }}>סכום ₪</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input-field text-sm w-full"
            min="0" step="1" placeholder="0"
          />
        </div>
      </div>

      {/* Customer selector */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>לקוח</p>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => { setCustomerMode('walkin'); setSelectedCustomer(null); setCustomerSearch(''); setIsDebt(false) }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
            style={customerMode === 'walkin'
              ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}
          >
            🚶 מזדמן
          </button>
          <button
            onClick={() => setCustomerMode('search')}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
            style={customerMode === 'search'
              ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}
          >
            🔍 לקוח רשום
          </button>
        </div>

        {customerMode === 'search' && (
          <div className="relative">
            <input
              value={selectedCustomer
                ? `${selectedCustomer.name}${selectedCustomer.phone ? ' · ' + selectedCustomer.phone : ''}`
                : customerSearch}
              onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value) }}
              onClick={() => { if (selectedCustomer) { setSelectedCustomer(null); setCustomerSearch('') } }}
              className="input-field text-sm w-full"
              placeholder="שם, טלפון..."
            />
            {(customerResults.length > 0 || searching) && !selectedCustomer && (
              <div
                className="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border shadow-lg overflow-hidden"
                style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
              >
                {searching ? (
                  <div className="py-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>מחפש...</div>
                ) : customerResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickCustomer(c)}
                    className="w-full text-right px-4 py-3 text-sm flex justify-between items-center transition-colors hover:bg-[var(--color-surface)]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment method (hidden when saving as debt) */}
      {!isDebt && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>אמצעי תשלום</p>
          <div className="flex gap-2 flex-wrap">
            {payMethods.map(m => (
              <button
                key={m.k}
                onClick={() => setPayMethod(m.k)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
                style={payMethod === m.k
                  ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Debt toggle — only when existing customer is selected */}
      {customerMode === 'search' && selectedCustomer && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isDebt}
            onChange={e => setIsDebt(e.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: 'var(--color-gold)' }}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            השאר כחוב ללקוח
          </span>
        </label>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving || !amount || !description.trim()}
        className="btn-primary w-full py-3 text-sm font-bold"
      >
        {saving ? 'שומר...' : isDebt ? '📋 רשום חוב' : '✅ רשום תקבול'}
      </button>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Staff Payments Section
// ─────────────────────────────────────────────
function StaffPaymentsSection({ settings }) {
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')

  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null
  const { markAllPaid } = useStaffCommissions({ startDate: monthStart, endDate: monthEnd, branchId })

  const [staffList, setStaffList]   = useState([])
  const [appts, setAppts]           = useState([])
  const [manualIncome, setManualIncome] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [paying, setPaying]         = useState(null)

  useEffect(() => {
    async function load() {
      setLoadingData(true)
      const [{ data: staffData }, { data: apptData }, { data: miData }] = await Promise.all([
        supabase
          .from('staff')
          .select('id, name, photo_url, commission_type, commission_rate, monthly_salary')
          .eq('is_active', true),
        supabase
          .from('appointments')
          .select('staff_id, services(price)')
          .eq('status', 'completed')
          .gte('start_at', monthStart + 'T00:00:00')
          .lte('start_at', monthEnd + 'T23:59:59'),
        // Walk-in receipts (quick income) — credited to the selected staff too.
        supabase
          .from('manual_income')
          .select('staff_id, amount, appointment_id')
          .gte('date', monthStart)
          .lte('date', monthEnd),
      ])
      setStaffList(staffData ?? [])
      setAppts(apptData ?? [])
      setManualIncome(miData ?? [])
      setLoadingData(false)
    }
    load()
  }, [monthStart, monthEnd])

  function calcStaff(member) {
    const effectiveType = member.commission_type === 'inherit'
      ? (settings?.commission_type ?? 'percentage')
      : member.commission_type
    const effectiveRate = member.commission_type === 'inherit'
      ? (settings?.commission_default_rate ?? 0)
      : (member.commission_rate ?? 0)

    const memberAppts = appts.filter(a => a.staff_id === member.id)
    // Walk-in receipts attached to this staff — skip ones already tied to an
    // appointment, since those appointments would double-count the revenue.
    const memberManual = manualIncome.filter(m => m.staff_id === member.id && !m.appointment_id)
    const count = memberAppts.length + memberManual.length
    const revenue =
      memberAppts.reduce((sum, a) => sum + (a.services?.price ?? 0), 0)
      + memberManual.reduce((sum, m) => sum + (Number(m.amount) || 0), 0)

    let amount = 0
    if (effectiveType === 'salary') {
      amount = member.monthly_salary ?? 0
    } else if (effectiveType === 'percentage') {
      amount = revenue * (effectiveRate / 100)
    } else if (effectiveType === 'fixed') {
      amount = count * effectiveRate
    }

    return { count, revenue, amount, effectiveType }
  }

  async function handleMarkAllPaid(staffId) {
    setPaying(staffId)
    try {
      await markAllPaid(staffId)
    } finally {
      setPaying(null)
    }
  }

  const rows = staffList.map(m => ({ ...m, ...calcStaff(m) }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="card p-5"
    >
      <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        💈 תשלומי ספרים החודש
      </h2>

      {loadingData ? (
        <div className="flex justify-center py-6"><Spinner size="md" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--color-muted)' }}>אין ספרים פעילים</p>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: 'name', label: 'ספר',
              render: m => (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }}>
                    {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
                  </div>
                  <span className="font-medium whitespace-nowrap" style={{ color: 'var(--color-text)' }}>{m.name}</span>
                </div>
              ),
            },
            { key: 'count',   label: 'תורים',   render: m => m.count },
            { key: 'revenue', label: 'הכנסות',  render: m => formatILS(m.revenue) },
            {
              key: 'commission', label: 'עמלה',
              render: m => (
                <span style={{ color: 'var(--color-muted)' }}>
                  {m.effectiveType === 'salary' && 'משכורת'}
                  {m.effectiveType === 'percentage' && `${m.commission_type === 'inherit' ? settings?.commission_default_rate : m.commission_rate}%`}
                  {m.effectiveType === 'fixed' && `₪${m.commission_type === 'inherit' ? settings?.commission_default_rate : m.commission_rate}/תור`}
                </span>
              ),
            },
            { key: 'amount', label: 'לתשלום', render: m => <span style={{ color: 'var(--color-gold)', fontWeight: 700 }}>{formatILS(m.amount)}</span> },
            {
              key: 'action', label: '',
              render: m => (
                <button
                  onClick={() => handleMarkAllPaid(m.id)}
                  disabled={paying === m.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}
                >
                  {paying === m.id ? '...' : '💳 שולם'}
                </button>
              ),
            },
          ]}
          rows={rows}
          mobileRowRender={m => (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }}>
                {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{m.name}</p>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{m.count} תורים · {formatILS(m.revenue)}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="font-bold text-sm" style={{ color: 'var(--color-gold)' }}>{formatILS(m.amount)}</span>
                <button
                  onClick={() => handleMarkAllPaid(m.id)}
                  disabled={paying === m.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}
                >
                  {paying === m.id ? '...' : '💳 שולם'}
                </button>
              </div>
            </div>
          )}
        />
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Main Dashboard Tab
// ─────────────────────────────────────────────
export function DashboardTab() {
  const { currentBranch } = useBranch()
  const { stats, monthly, recent, loading } = useFinanceDashboard({ branchId: currentBranch?.id ?? null })
  const { settings } = useBusinessSettings()
  const isOsekPatur = settings?.business_type === 'osek_patur'

  if (loading) return <AdminSkeleton />

  const statCards = [
    {
      icon: '💰',
      label: 'הכנסות החודש',
      value: stats?.income ?? 0,
      color: 'var(--color-gold)',
    },
    {
      icon: '💸',
      label: 'הוצאות החודש',
      value: stats?.expenses ?? 0,
      color: '#dc2626',
    },
    {
      icon: (stats?.profit ?? 0) >= 0 ? '📈' : '📉',
      label: 'רווח',
      value: stats?.profit ?? 0,
      color: (stats?.profit ?? 0) >= 0 ? '#16a34a' : '#dc2626',
    },
    ...(!isOsekPatur
      ? [{ icon: '🏦', label: 'מאזן מע"מ', value: stats?.vatBalance ?? 0, color: '#2563eb' }]
      : []),
  ]

  const maxValue = Math.max(...monthly.map(m => Math.max(m.income, m.expenses)), 1)
  const chartHeight = 180
  const barWidth = 26
  const gap = 14

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className={`grid gap-3 ${isOsekPatur ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="card p-3 sm:p-4"
          >
            <div className="text-xl mb-1">{card.icon}</div>
            <p className="text-xs font-medium mb-1 leading-tight" style={{ color: 'var(--color-muted)' }}>
              {card.label}
            </p>
            <p className="text-lg sm:text-xl font-black" style={{ color: card.color }}>
              {formatILS(card.value)}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Quick receipt */}
      <QuickReceiptPanel />

      {/* Bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card p-4"
      >
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          הכנסות vs הוצאות
        </h2>

        {monthly.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${monthly.length * (barWidth * 2 + gap) + gap} ${chartHeight + 36}`}
              width="100%"
              height={chartHeight + 36}
              dir="ltr"
              style={{ minWidth: monthly.length > 4 ? monthly.length * 58 : 'auto' }}
            >
              {monthly.map((m, i) => {
                const x = gap + i * (barWidth * 2 + gap)
                const incomeH = maxValue > 0 ? (m.income / maxValue) * chartHeight : 0
                const expenseH = maxValue > 0 ? (m.expenses / maxValue) * chartHeight : 0
                return (
                  <g key={m.month}>
                    <rect x={x} y={chartHeight - incomeH} width={barWidth} height={incomeH} rx={4} fill="var(--color-gold)" opacity={0.9} />
                    <rect x={x + barWidth + 2} y={chartHeight - expenseH} width={barWidth} height={expenseH} rx={4} fill="#dc2626" opacity={0.5} />
                    <text x={x + barWidth} y={chartHeight + 18} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{m.month}</text>
                  </g>
                )
              })}
            </svg>
            <div className="flex gap-4 justify-center mt-1">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span className="inline-block w-3 h-3 rounded" style={{ background: 'var(--color-gold)' }} /> הכנסות
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span className="inline-block w-3 h-3 rounded" style={{ background: '#dc2626', opacity: 0.5 }} /> הוצאות
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>אין נתונים להצגה</p>
        )}
      </motion.div>

      {/* Staff payments */}
      <StaffPaymentsSection settings={settings} />

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="card p-4"
      >
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          פעולות אחרונות
        </h2>

        {recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            {recent.map((item, i) => {
              const isPositive = item.amount >= 0
              const icon = item.type === 'expense' ? (item.icon || '💸') : item.type === 'manual' ? '💰' : '💳'
              let formattedDate = ''
              try { formattedDate = format(new Date(item.date), 'dd/MM HH:mm', { locale: he }) } catch { formattedDate = '' }
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{formattedDate}</p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0" style={{ color: isPositive ? '#16a34a' : '#dc2626' }}>
                    {isPositive ? '+' : ''}{formatILS(item.amount)}
                  </span>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>אין פעולות אחרונות</p>
        )}
      </motion.div>
    </div>
  )
}
