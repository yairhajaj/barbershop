import { motion } from 'framer-motion'
import { useMotion } from '../../../hooks/useMotion'
import { ResponsiveTable } from '../../../components/ui/ResponsiveTable'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFinanceDashboard } from '../../../hooks/useFinanceDashboard'
import { useBranch } from '../../../contexts/BranchContext'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useStaffCommissions } from '../../../hooks/useStaffCommissions'
import { useServices } from '../../../hooks/useServices'
import { useStaff } from '../../../hooks/useStaff'
import { formatILS, calcVat, hasVat, PAYMENT_METHODS } from '../../../lib/finance'
import { Spinner } from '../../../components/ui/Spinner'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'
import { useToast } from '../../../components/ui/Toast'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale/he'
import { supabase } from '../../../lib/supabase'
import { fetchProductSales } from '../../../hooks/useProductSales'
import { printInvoice } from '../../../lib/invoice'

// ─────────────────────────────────────────────
// Quick Receipt Panel
// ─────────────────────────────────────────────
function QuickReceiptPanel() {
  const m = useMotion()
  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null
  const { settings } = useBusinessSettings()
  const { services } = useServices({ activeOnly: true })
  const { staff } = useStaff({ activeOnly: true, branchId: currentBranch?.id ?? null })
  const showToast = useToast()
  const qc = useQueryClient()

  const [topServices, setTopServices] = useState([])
  const [products, setProducts] = useState([])
  const [productsOpen, setProductsOpen] = useState(false)

  // cart: [{ tempId, type:'service'|'product'|'custom', id, name, unit_price, quantity }]
  const [cartItems, setCartItems] = useState([])
  // custom item entry
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')

  const [payMethod, setPayMethod] = useState('cash')
  const [isDebt, setIsDebt] = useState(false)
  const [staffId, setStaffId] = useState('')

  // customer
  const [customerMode, setCustomerMode] = useState('walkin')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const total = cartItems.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const hasProducts = cartItems.some(i => i.type === 'product')

  useEffect(() => {
    if (!services.length) return
    async function load() {
      const { data } = await supabase.from('appointments').select('service_id').not('service_id', 'is', null)
      const freq = {}
      ;(data ?? []).forEach(a => { freq[a.service_id] = (freq[a.service_id] ?? 0) + 1 })
      setTopServices([...services].sort((a, b) => (freq[b.id] ?? 0) - (freq[a.id] ?? 0)).slice(0, 8))
    }
    load()
  }, [services])

  useEffect(() => {
    if (!staffId && staff.length > 0) setStaffId(staff[0].id)
  }, [staff, staffId])

  useEffect(() => {
    supabase.from('products').select('id, name, price').eq('is_active', true)
      .order('display_order').then(({ data }) => setProducts(data ?? []))
  }, [])

  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('profiles').select('id, name, phone').eq('role', 'customer')
        .or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`).limit(6)
      setCustomerResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  function addToCart({ type, id, name, unit_price }) {
    setCartItems(prev => {
      if (id) {
        const existing = prev.find(i => i.id === id && i.type === type)
        if (existing) return prev.map(i => i.id === id && i.type === type ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { tempId: Date.now() + Math.random(), type, id: id ?? null, name, unit_price: Number(unit_price) || 0, quantity: 1 }]
    })
  }

  function setQty(tempId, newQty) {
    if (newQty < 1) setCartItems(prev => prev.filter(i => i.tempId !== tempId))
    else setCartItems(prev => prev.map(i => i.tempId === tempId ? { ...i, quantity: newQty } : i))
  }

  function addCustom() {
    if (!customName.trim() || !Number(customPrice)) return
    addToCart({ type: 'custom', id: null, name: customName.trim(), unit_price: Number(customPrice) })
    setCustomName('')
    setCustomPrice('')
  }

  function pickCustomer(c) {
    setSelectedCustomer(c)
    setCustomerSearch('')
    setCustomerResults([])
  }

  function resetForm() {
    setCartItems([])
    setCustomName('')
    setCustomPrice('')
    setSelectedCustomer(null)
    setCustomerMode('walkin')
    setIsDebt(false)
    setPayMethod('cash')
  }

  function validate() {
    if (cartItems.length === 0) { showToast({ message: 'הוסף לפחות פריט אחד', type: 'error' }); return false }
    if (hasProducts && !staffId) { showToast({ message: 'יש לבחור עובד לחישוב עמלת מוצרים', type: 'error' }); return false }
    if (isDebt && !selectedCustomer) { showToast({ message: 'לחוב נדרש לקוח רשום', type: 'error' }); return false }
    return true
  }

  async function handleSaveReceipt() {
    if (!validate()) return
    setSaving(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      if (isDebt) {
        const { error } = await supabase.from('customer_debts').insert({
          customer_id: selectedCustomer.id,
          amount: total,
          description: cartItems.map(i => i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name).join(', '),
          status: 'pending',
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['customer_debts'] })
        showToast({ message: 'חוב נרשם ✓', type: 'success' })
      } else {
        const rows = cartItems.map(item => {
          const amt = item.unit_price * item.quantity
          const entry = {
            description: item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
            amount: amt,
            date: today,
            payment_method: payMethod,
            customer_name: selectedCustomer?.name ?? null,
            customer_id: selectedCustomer?.id ?? null,
            service_id: item.type === 'service' ? item.id : null,
            product_id: item.type === 'product' ? item.id : null,
            staff_id: staffId || null,
            branch_id: branchId,
          }
          if (hasVat(settings?.business_type)) {
            entry.vat_amount = calcVat(amt, settings?.vat_rate, settings?.business_type).vatAmount
          }
          return entry
        })
        const { error } = await supabase.from('manual_income').insert(rows)
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

  async function handleSaveAndInvoice() {
    if (!validate()) return
    setSaving(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const serviceName = cartItems.map(i => i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name).join(' + ')

      // get next invoice number
      const { data: invNum, error: numErr } = await supabase.rpc('next_invoice_number')
      if (numErr) throw numErr

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        customer_name: selectedCustomer?.name ?? 'לקוח מזדמן',
        customer_id: selectedCustomer?.id ?? null,
        total_amount: total,
        service_name: serviceName,
        payment_method: payMethod,
        branch_id: branchId,
        invoice_number: invNum,
      }).select().single()
      if (invErr) throw invErr

      const itemsPayload = cartItems.map(item => ({
        invoice_id: inv.id,
        kind: item.type === 'product' ? 'product' : 'service',
        service_id: item.type === 'service' ? item.id : null,
        product_id: item.type === 'product' ? item.id : null,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.unit_price * item.quantity,
        staff_id: staffId || null,
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      printInvoice({
        appointment: { id: inv.id, services: { name: serviceName, price: total } },
        business: settings,
        businessType: settings?.business_type,
        vatRate: settings?.vat_rate ?? 18,
        invoiceNumber: String(invNum),
        paymentMethod: payMethod,
        items: itemsPayload.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total })),
        logoUrl: settings?.logo_url,
      })

      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
      showToast({ message: 'חשבונית הופקה ✓', type: 'success' })
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
    <motion.div variants={m.fadeUp} initial="hidden" animate="visible" className="card p-4 space-y-4">
      <h2 className="font-bold text-base" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        ⚡ תקבול מהיר
      </h2>

      {/* Services */}
      {topServices.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>✂️ שירותים</p>
          <div className="flex flex-wrap gap-2">
            {topServices.map(svc => {
              const inCart = cartItems.find(i => i.id === svc.id && i.type === 'service')
              return (
                <button
                  key={svc.id}
                  onClick={() => addToCart({ type: 'service', id: svc.id, name: svc.name, unit_price: svc.price })}
                  className="text-xs px-3 py-2 rounded-xl font-medium transition-all border relative"
                  style={inCart
                    ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'var(--color-gold-tint)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
                >
                  {svc.name} — ₪{svc.price}
                  {inCart && <span className="mr-1 font-bold">×{inCart.quantity}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Products */}
      <div>
        <button
          onClick={() => setProductsOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--color-muted)' }}
        >
          📦 מוצרים <span className="text-[10px]">{productsOpen ? '▲' : '▼'}</span>
        </button>
        {productsOpen && (
          <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border p-1.5 space-y-0.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {products.length === 0
              ? <p className="text-xs text-center py-3" style={{ color: 'var(--color-muted)' }}>אין מוצרים</p>
              : products.map(p => {
                  const inCart = cartItems.find(i => i.id === p.id && i.type === 'product')
                  return (
                    <button key={p.id}
                      onClick={() => addToCart({ type: 'product', id: p.id, name: p.name, unit_price: p.price })}
                      className="w-full text-right px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors"
                      style={inCart ? { background: 'var(--color-gold-tint)', color: 'var(--color-gold)' } : { color: 'var(--color-text)' }}>
                      <span>{p.name}{inCart && <span className="mr-1 font-bold text-xs">×{inCart.quantity}</span>}</span>
                      <span className="font-bold text-xs" style={{ color: 'var(--color-gold)' }}>₪{p.price}</span>
                    </button>
                  )
                })}
          </div>
        )}
      </div>

      {/* Custom item */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>➕ פריט ידני</p>
        <div className="flex gap-2">
          <input value={customName} onChange={e => setCustomName(e.target.value)}
            className="input-field text-sm flex-1" placeholder="שם" />
          <input type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
            className="input-field text-sm w-24" placeholder="₪" min="0" step="1" />
          <button onClick={addCustom}
            className="px-3 py-2 rounded-xl text-sm font-bold transition-colors"
            style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}>
            הוסף
          </button>
        </div>
      </div>

      {/* Cart */}
      {cartItems.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
            🛒 עגלה
          </div>
          {cartItems.map(item => (
            <div key={item.tempId} className="flex items-center gap-2 px-3 py-2 border-t text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              <span className="flex-1 truncate">{item.name}</span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>₪{item.unit_price}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setQty(item.tempId, item.quantity - 1)}
                  className="w-6 h-6 rounded-lg text-center text-xs font-bold"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>−</button>
                <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                <button onClick={() => setQty(item.tempId, item.quantity + 1)}
                  className="w-6 h-6 rounded-lg text-center text-xs font-bold"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>+</button>
              </div>
              <span className="font-bold text-xs w-14 text-left" style={{ color: 'var(--color-gold)' }}>
                ₪{(item.unit_price * item.quantity).toFixed(0)}
              </span>
              <button onClick={() => setQty(item.tempId, 0)}
                className="text-xs" style={{ color: 'var(--color-muted)' }}>✕</button>
            </div>
          ))}
          <div className="px-3 py-2 flex justify-between items-center font-bold text-sm border-t"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <span style={{ color: 'var(--color-muted)' }}>סה"כ</span>
            <span style={{ color: 'var(--color-gold)' }}>₪{total.toFixed(0)}</span>
          </div>
        </div>
      )}

      {/* Staff */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>
          עובד {hasProducts && <span style={{ color: '#dc2626' }}>*</span>}
        </label>
        <select value={staffId} onChange={e => setStaffId(e.target.value)} className="input-field w-full text-sm">
          <option value="">— ללא —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Customer */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>לקוח</p>
        <div className="flex gap-2 mb-2">
          <button onClick={() => { setCustomerMode('walkin'); setSelectedCustomer(null); setCustomerSearch(''); setIsDebt(false) }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
            style={customerMode === 'walkin'
              ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'var(--color-gold-tint)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}>
            🚶 מזדמן
          </button>
          <button onClick={() => setCustomerMode('search')}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
            style={customerMode === 'search'
              ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'var(--color-gold-tint)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}>
            🔍 לקוח רשום
          </button>
        </div>
        {customerMode === 'search' && (
          <div className="relative">
            <input
              value={selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ' · ' + selectedCustomer.phone : ''}` : customerSearch}
              onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value) }}
              onClick={() => { if (selectedCustomer) { setSelectedCustomer(null); setCustomerSearch('') } }}
              className="input-field text-sm w-full" placeholder="שם, טלפון..." />
            {(customerResults.length > 0 || searching) && !selectedCustomer && (
              <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border shadow-lg overflow-hidden"
                style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                {searching
                  ? <div className="py-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>מחפש...</div>
                  : customerResults.map(c => (
                    <button key={c.id} onClick={() => pickCustomer(c)}
                      className="w-full text-right px-4 py-3 text-sm flex justify-between items-center transition-colors hover:bg-[var(--color-surface)]"
                      style={{ color: 'var(--color-text)' }}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{c.phone}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment method */}
      {!isDebt && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>אמצעי תשלום</p>
          <div className="flex gap-2 flex-wrap">
            {payMethods.map(pm => (
              <button key={pm.k} onClick={() => setPayMethod(pm.k)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
                style={payMethod === pm.k
                  ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'var(--color-gold-tint)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'transparent' }}>
                {pm.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Debt toggle */}
      {customerMode === 'search' && selectedCustomer && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={isDebt} onChange={e => setIsDebt(e.target.checked)}
            className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-gold)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>השאר כחוב ללקוח</span>
        </label>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSaveReceipt} disabled={saving || cartItems.length === 0}
          className="btn-primary flex-1 py-3 text-sm font-bold">
          {saving ? 'שומר...' : isDebt ? '📋 רשום חוב' : '✅ רשום תקבול'}
        </button>
        {!isDebt && (
          <button onClick={handleSaveAndInvoice} disabled={saving || cartItems.length === 0}
            className="py-3 px-4 rounded-xl text-sm font-bold transition-colors"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            📄 הוצא חשבונית
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Staff Payments Section
// ─────────────────────────────────────────────
function StaffPaymentsSection({ settings }) {
  const m = useMotion()
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')

  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null
  const { markAllPaid } = useStaffCommissions({ startDate: monthStart, endDate: monthEnd, branchId })

  const [staffList, setStaffList]   = useState([])
  const [appts, setAppts]           = useState([])
  const [manualIncome, setManualIncome] = useState([])
  const [productSales, setProductSales] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [paying, setPaying]         = useState(null)

  useEffect(() => {
    async function load() {
      setLoadingData(true)
      const [{ data: staffData }, { data: apptData }, { data: miData }, prodSalesData] = await Promise.all([
        supabase
          .from('staff')
          .select('id, name, photo_url, commission_type, commission_rate, monthly_salary, product_commission_type, product_commission_rate')
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
          .is('product_id', null)
          .gte('date', monthStart)
          .lte('date', monthEnd),
        // Unified product sales: manual_income (product_id) + invoice_items (kind=product)
        fetchProductSales({ from: monthStart, to: monthEnd }).catch(err => {
          console.warn('fetchProductSales failed:', err)
          return []
        }),
      ])
      setStaffList(staffData ?? [])
      setAppts(apptData ?? [])
      setManualIncome(miData ?? [])
      setProductSales(Array.isArray(prodSalesData) ? prodSalesData : (prodSalesData?.data ?? []))
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

    // Product sales commission — unified from manual_income + invoice_items
    const memberProducts = productSales.filter(p => p.staff_id === member.id)
    const productRevenue = memberProducts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const productUnits = memberProducts.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0)
    const pct = member.product_commission_type
    const prate = Number(member.product_commission_rate) || 0
    const productCommission =
      pct === 'percentage' ? productRevenue * (prate / 100)
      : pct === 'fixed'   ? productUnits * prate
      : 0

    return { count, revenue, amount, effectiveType, productRevenue, productCount: productUnits, productCommission }
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
      variants={m.fadeUp}
      initial="hidden"
      animate="visible"
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
                  <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold" style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)' }}>
                    {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
                  </div>
                  <span className="font-medium whitespace-nowrap" style={{ color: 'var(--color-text)' }}>{m.name}</span>
                </div>
              ),
            },
            { key: 'count',   label: 'תורים',   render: m => m.count },
            { key: 'revenue', label: 'הכנסות שירותים',  render: m => formatILS(m.revenue) },
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
            { key: 'amount', label: 'לתשלום', render: m => (
              <div className="space-y-1">
                <div style={{ color: 'var(--color-gold)', fontWeight: 700 }}>{formatILS(m.amount)}</div>
                {m.productCommission > 0 && (
                  <div className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1px solid var(--color-success-ring)' }}>
                    📦 {m.productCount} מוצרים · {formatILS(m.productCommission)}
                  </div>
                )}
              </div>
            ) },
            {
              key: 'action', label: '',
              render: m => (
                <button
                  onClick={() => handleMarkAllPaid(m.id)}
                  disabled={paying === m.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}
                >
                  {paying === m.id ? '...' : '💳 שולם'}
                </button>
              ),
            },
          ]}
          rows={rows}
          mobileRowRender={m => (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold" style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)' }}>
                {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : m.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{m.name}</p>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{m.count} תורים · {formatILS(m.revenue)}</p>
                {m.productCommission > 0 && (
                  <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-1 rounded-lg"
                    style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1px solid var(--color-success-ring)' }}>
                    📦 {m.productCount} מוצרים · {formatILS(m.productCommission)}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="font-bold text-sm" style={{ color: 'var(--color-gold)' }}>{formatILS(m.amount)}</span>
                <button
                  onClick={() => handleMarkAllPaid(m.id)}
                  disabled={paying === m.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}
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

  const m = useMotion()

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
      <motion.div
        className={`grid gap-3 ${isOsekPatur ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}
        variants={m.listStagger}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((card) => (
          <motion.div
            key={card.label}
            variants={m.fadeUp}
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
      </motion.div>

      {/* Quick receipt */}
      <QuickReceiptPanel />

      {/* Bar chart */}
      <motion.div
        variants={m.fadeUp}
        initial="hidden"
        animate="visible"
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
        variants={m.fadeUp}
        initial="hidden"
        animate="visible"
        className="card p-4"
      >
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          פעולות אחרונות
        </h2>

        {recent.length > 0 ? (
          <motion.div
            className="flex flex-col gap-2"
            variants={m.listStagger}
            initial="hidden"
            animate="visible"
          >
            {recent.map((item) => {
              const isPositive = item.amount >= 0
              const icon = item.type === 'expense' ? (item.icon || '💸') : item.type === 'manual' ? '💰' : '💳'
              let formattedDate = ''
              try { formattedDate = format(new Date(item.date), 'dd/MM HH:mm', { locale: he }) } catch { formattedDate = '' }
              return (
                <motion.div
                  key={item.id}
                  variants={m.fadeUp}
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
          </motion.div>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>אין פעולות אחרונות</p>
        )}
      </motion.div>
    </div>
  )
}
