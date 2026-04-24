import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBranch } from '../../contexts/BranchContext'
import { useToast } from '../../components/ui/Toast'
import { useProducts } from '../../hooks/useProducts'
import { docLabel, calcVat } from '../../lib/finance'
import { formatTime, formatDate } from '../../lib/utils'
import { Spinner } from '../../components/ui/Spinner'
import { printInvoice } from '../../lib/invoice'

const PAY_METHODS = [
  { key: 'cash',     icon: '💵', label: 'מזומן',  color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   border: 'rgba(22,163,74,0.3)' },
  { key: 'bit',      icon: '📱', label: 'ביט',    color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.3)' },
  { key: 'credit',   icon: '💳', label: 'אשראי',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.3)' },
]

export function QuickSettle() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { settings } = useBusinessSettings()
  const { currentBranch } = useBranch()
  const showToast = useToast()

  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({}) // { [aptId]: true }
  const [otherModal, setOtherModal] = useState(null) // { apt, method, amount }
  const [done, setDone] = useState([]) // ids that were resolved

  const { products } = useProducts({ activeOnly: true })

  const businessType = settings?.business_type || 'osek_morsheh'
  const vatRate = settings?.vat_rate ?? 18
  const invoicingEnabled = settings?.invoicing_enabled !== false

  useEffect(() => {
    load()
  }, [currentBranch, invoicingEnabled])

  async function load() {
    setLoading(true)
    const now = new Date().toISOString()
    let q = supabase
      .from('appointments')
      .select(`
        id, start_at, end_at, staff_id, service_id,
        profiles:customer_id(id, name, phone),
        services(id, name, price),
        staff(id, name)
      `)
      .eq('status', 'confirmed')
      .lt('start_at', now)
      .order('start_at', { ascending: false })
      .limit(100)

    if (currentBranch?.id) q = q.or(`branch_id.eq.${currentBranch.id},branch_id.is.null`)

    const { data, error } = await q
    if (error) {
      showToast({ message: `שגיאה: ${error.message}`, type: 'error' })
      setLoading(false)
      return
    }
    // In invoicing mode: show unpaid only. In attendance mode: show all past confirmed.
    const filtered = invoicingEnabled
      ? (data ?? []).filter(a => !a.cash_paid && a.payment_status !== 'paid')
      : (data ?? [])
    setAppointments(filtered)
    setLoading(false)
  }

  function markDone(id) {
    setDone(prev => [...prev, id])
  }

  async function handlePay(apt, method, customAmount = null, extraProducts = []) {
    if (busy[apt.id]) return
    setBusy(b => ({ ...b, [apt.id]: true }))
    try {
      const basePrice = customAmount ?? Number(apt.services?.price || 0)
      const productsTotal = extraProducts.reduce((s, p) => s + Number(p.price || 0) * (p.qty || 1), 0)
      const price = basePrice + productsTotal
      const { beforeVat, vatAmount } = calcVat(price, vatRate, businessType)
      const nowIso = new Date().toISOString()

      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')
      const isPatur = businessType === 'osek_patur'

      const { data: inv } = await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: apt.id,
        customer_name: apt.profiles?.name || '',
        customer_phone: apt.profiles?.phone || '',
        service_name: apt.services?.name || '',
        staff_name: apt.staff?.name || '',
        service_date: apt.start_at,
        amount_before_vat: beforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: price,
        status: 'paid',
        paid_at: nowIso,
        notes: method,
        document_type: isPatur ? 400 : 320,
      }).select().single()

      await supabase.from('manual_income').insert({
        amount: price,
        vat_amount: vatAmount,
        description: apt.services?.name || 'תור',
        customer_name: apt.profiles?.name || '',
        customer_id: apt.profiles?.id ?? null,
        staff_id: apt.staff_id ?? null,
        service_id: apt.service_id ?? null,
        appointment_id: apt.id,
        payment_method: method,
        date: nowIso.slice(0, 10),
        branch_id: currentBranch?.id ?? null,
      })

      await supabase.from('appointments')
        .update({ status: 'completed', payment_status: 'paid', invoice_sent: true, cash_paid: method === 'cash' })
        .eq('id', apt.id)
      qc.invalidateQueries({ queryKey: ['appointments'] })

      // Auto-print
      if (inv) {
        printInvoice({
          appointment: { ...apt, id: inv.id },
          business: {
            name: settings?.business_name || '',
            address: settings?.business_address || '',
            phone: settings?.business_phone || '',
            email: settings?.business_email || '',
          },
          businessType,
          vatRate,
          invoiceNumber: String(invoiceNum),
          paymentMethod: method,
          logoUrl: settings?.logo_url,
        })
      }

      markDone(apt.id)
      showToast({ message: `✓ ${apt.profiles?.name} — ${docLabel(businessType)} הופקה`, type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setBusy(b => ({ ...b, [apt.id]: false }))
    }
  }

  async function handlePayNoInvoice(apt, method) {
    if (busy[apt.id]) return
    setBusy(b => ({ ...b, [apt.id]: true }))
    try {
      const price = Number(apt.services?.price || 0)
      const nowIso = new Date().toISOString()

      if (price > 0) {
        await supabase.from('manual_income').insert({
          amount: price,
          vat_amount: 0,
          description: apt.services?.name || 'תור',
          customer_name: apt.profiles?.name || '',
          customer_id: apt.profiles?.id ?? null,
          staff_id: apt.staff_id ?? null,
          service_id: apt.service_id ?? null,
          appointment_id: apt.id,
          payment_method: method,
          date: nowIso.slice(0, 10),
          branch_id: currentBranch?.id ?? null,
        })
      }

      await supabase.from('appointments')
        .update({ status: 'completed', payment_status: price > 0 ? 'paid' : null, cash_paid: method === 'cash' && price > 0 })
        .eq('id', apt.id)
      qc.invalidateQueries({ queryKey: ['appointments'] })

      markDone(apt.id)
      showToast({ message: `✅ ${apt.profiles?.name} · ${price > 0 ? `₪${price}` : 'הגיע'}`, type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setBusy(b => ({ ...b, [apt.id]: false }))
    }
  }

  async function handleNoShow(apt) {
    if (busy[apt.id]) return
    setBusy(b => ({ ...b, [apt.id]: true }))
    try {
      await supabase.from('appointments')
        .update({ status: 'completed', no_show: true })
        .eq('id', apt.id)
      qc.invalidateQueries({ queryKey: ['appointments'] })
      markDone(apt.id)
      showToast({ message: `${apt.profiles?.name} — סומן "לא הגיע"`, type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setBusy(b => ({ ...b, [apt.id]: false }))
    }
  }

  const visible = appointments.filter(a => !done.includes(a.id))
  const resolvedCount = done.length
  const total = appointments.length

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 border-b"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <button onClick={() => navigate(-1)}
          className="text-xl leading-none px-1"
          style={{ color: 'var(--color-muted)' }}>
          ←
        </button>
        <div className="flex-1">
          <h1 className="font-black text-base" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {invoicingEnabled ? '⚡ סגירת תורים מהירה' : '✓ סימון נוכחות'}
          </h1>
          {!loading && (
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {visible.length} נותרו · {resolvedCount} טופלו
            </p>
          )}
        </div>
        {/* Progress bar */}
        {total > 0 && (
          <div className="w-20 h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--color-border)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(resolvedCount / total) * 100}%`, background: 'var(--color-gold)' }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : visible.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20">
            <div className="text-6xl mb-4">{total > 0 ? '🎉' : '✅'}</div>
            <p className="font-black text-xl mb-2" style={{ color: 'var(--color-text)' }}>
              {total > 0 ? 'הכל טופל!' : 'אין תורים ממתינים'}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
              {total > 0 ? `טיפלת ב-${resolvedCount} תורים` : 'כל התורים הקודמים מטופלים'}
            </p>
            <button onClick={() => navigate(-1)}
              className="btn-primary px-6 py-2.5">
              חזור לדשבורד
            </button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {visible.map(apt => (
              <AppointmentRow
                key={apt.id}
                apt={apt}
                busy={!!busy[apt.id]}
                businessType={businessType}
                invoicingEnabled={invoicingEnabled}
                onPay={(method) => handlePay(apt, method)}
                onPayNoInvoice={(method) => handlePayNoInvoice(apt, method)}
                onNoShow={() => handleNoShow(apt)}
                onOther={() => setOtherModal({ apt, method: 'cash', amount: String(apt.services?.price || ''), extraProducts: [] })}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* "אחר" modal — only in invoicing mode */}
      {invoicingEnabled && otherModal && (
        <OtherModal
          modal={otherModal}
          products={products}
          onChange={setOtherModal}
          onClose={() => setOtherModal(null)}
          onConfirm={() => {
            const baseAmt = Number(otherModal.amount)
            if (!baseAmt && otherModal.extraProducts.length === 0) {
              showToast({ message: 'הכנס סכום', type: 'error' }); return
            }
            handlePay(otherModal.apt, otherModal.method, baseAmt || null, otherModal.extraProducts)
            setOtherModal(null)
          }}
        />
      )}
    </div>
  )
}

const ALL_PAY_METHODS = [
  ...PAY_METHODS,
  { key: 'transfer', icon: '🏦', label: 'העברה', color: '#d97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)' },
  { key: 'paybox', icon: '📦', label: 'Paybox', color: '#6b7280', bg: 'var(--color-surface)', border: 'var(--color-border)' },
]

function OtherModal({ modal, products, onChange, onClose, onConfirm }) {
  const productsTotal = modal.extraProducts.reduce((s, p) => s + Number(p.price || 0) * (p.qty || 1), 0)
  const baseAmt = Number(modal.amount) || 0
  const grandTotal = baseAmt + productsTotal

  function toggleProduct(product) {
    onChange(m => {
      const existing = m.extraProducts.find(p => p.id === product.id)
      if (existing) {
        return { ...m, extraProducts: m.extraProducts.filter(p => p.id !== product.id) }
      }
      return { ...m, extraProducts: [...m.extraProducts, { ...product, qty: 1 }] }
    })
  }

  function changeQty(productId, delta) {
    onChange(m => ({
      ...m,
      extraProducts: m.extraProducts
        .map(p => p.id === productId ? { ...p, qty: Math.max(1, (p.qty || 1) + delta) } : p)
    }))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card modal-bg w-full max-w-sm overflow-hidden"
        style={{ background: 'var(--color-modal-panel)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <h3 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
            ➕ תשלום אחר — {modal.apt.profiles?.name}
          </h3>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 space-y-4" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          {/* Service amount */}
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-muted)' }}>סכום שירות (₪)</label>
            <input
              type="number"
              value={modal.amount}
              onChange={e => onChange(m => ({ ...m, amount: e.target.value }))}
              className="input-field w-full text-lg font-bold"
              min="0"
            />
          </div>

          {/* Products */}
          {products.length > 0 && (
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-muted)' }}>הוסף מוצרים</label>
              <div className="flex flex-col gap-1.5">
                {products.map(product => {
                  const selected = modal.extraProducts.find(p => p.id === product.id)
                  return (
                    <div key={product.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2 border transition-all"
                      style={{
                        background: selected ? 'rgba(37,99,235,0.07)' : 'var(--color-surface)',
                        borderColor: selected ? 'rgba(37,99,235,0.35)' : 'var(--color-border)',
                      }}>
                      <button className="flex-1 text-right min-w-0" onClick={() => toggleProduct(product)}>
                        <div className="text-xs font-bold truncate" style={{ color: 'var(--color-text)' }}>{product.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>₪{Number(product.price || 0).toLocaleString('he-IL')}</div>
                      </button>
                      {selected ? (
                        <div className="flex items-center gap-1 mr-2 flex-shrink-0">
                          <button onClick={() => changeQty(product.id, -1)}
                            className="w-6 h-6 rounded-full text-sm font-black flex items-center justify-center"
                            style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>−</button>
                          <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--color-text)' }}>{selected.qty}</span>
                          <button onClick={() => changeQty(product.id, 1)}
                            className="w-6 h-6 rounded-full text-sm font-black flex items-center justify-center"
                            style={{ background: 'var(--color-gold)', color: '#fff' }}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => toggleProduct(product)}
                          className="mr-2 w-6 h-6 rounded-full text-sm font-black flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--color-border)', color: 'var(--color-muted)' }}>+</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Method */}
          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--color-muted)' }}>אמצעי תשלום</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_PAY_METHODS.map(m => (
                <button key={m.key}
                  onClick={() => onChange(o => ({ ...o, method: m.key }))}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    background: modal.method === m.key ? m.bg : 'transparent',
                    color: modal.method === m.key ? m.color : 'var(--color-muted)',
                    borderColor: modal.method === m.key ? m.border : 'var(--color-border)',
                  }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {productsTotal > 0 && (
            <div className="flex justify-between text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              <span>שירות ₪{baseAmt.toLocaleString('he-IL')} + מוצרים ₪{productsTotal.toLocaleString('he-IL')}</span>
              <span className="font-black" style={{ color: 'var(--color-text)' }}>סה"כ ₪{grandTotal.toLocaleString('he-IL')}</span>
            </div>
          )}
          <button onClick={onConfirm} className="btn-primary w-full py-3 text-base font-black">
            ✓ אשר תשלום {grandTotal > 0 ? `₪${grandTotal.toLocaleString('he-IL')}` : ''}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function AppointmentRow({ apt, busy, businessType, invoicingEnabled, onPay, onPayNoInvoice, onNoShow, onOther }) {
  const price = Number(apt.price || apt.services?.price || 0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -60, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className="card p-3"
      style={{ border: '1px solid var(--color-border)' }}>

      {/* Top row: info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--color-text)' }}>
            {apt.profiles?.name || '—'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
            {apt.services?.name} · {apt.staff?.name} · {formatDate(apt.start_at)} {formatTime(apt.start_at)}
          </p>
        </div>
        {price > 0 && (
          <span className="font-black text-base flex-shrink-0 mr-2" style={{ color: 'var(--color-gold)' }}>
            ₪{price.toLocaleString('he-IL')}
          </span>
        )}
      </div>

      {/* Action buttons */}
      {busy ? (
        <div className="flex justify-center py-2"><Spinner size="sm" /></div>
      ) : invoicingEnabled ? (
        <div className="flex gap-1.5">
          {PAY_METHODS.map(m => (
            <button key={m.key}
              onClick={() => onPay(m.key)}
              className="flex-1 py-2.5 rounded-xl text-xs font-black flex flex-col items-center gap-0.5 transition-all active:scale-95"
              style={{ background: m.bg, color: m.color, border: `1.5px solid ${m.border}` }}>
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
          <button
            onClick={onNoShow}
            className="flex-1 py-2.5 rounded-xl text-xs font-black flex flex-col items-center gap-0.5 transition-all active:scale-95"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)' }}>
            <span className="text-base">👻</span>
            <span>לא הגיע</span>
          </button>
          <button
            onClick={onOther}
            className="flex-1 py-2.5 rounded-xl text-xs font-black flex flex-col items-center gap-0.5 transition-all active:scale-95"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)' }}>
            <span className="text-base">➕</span>
            <span>אחר</span>
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          {PAY_METHODS.map(m => (
            <button key={m.key}
              onClick={() => onPayNoInvoice(m.key)}
              className="flex-1 py-2.5 rounded-xl text-xs font-black flex flex-col items-center gap-0.5 transition-all active:scale-95"
              style={{ background: m.bg, color: m.color, border: `1.5px solid ${m.border}` }}>
              <span className="text-base">{m.icon}</span>
              <span>הגיע · {m.label}</span>
            </button>
          ))}
          <button
            onClick={onNoShow}
            className="flex-1 py-2.5 rounded-xl text-xs font-black flex flex-col items-center gap-0.5 transition-all active:scale-95"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)' }}>
            <span className="text-base">👻</span>
            <span>לא הגיע</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}
