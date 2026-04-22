import { useState, useEffect } from 'react'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../../lib/supabase'
import { useServices } from '../../../hooks/useServices'
import { useStaff } from '../../../hooks/useStaff'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'

const PAYMENT_METHODS = [
  { k: 'cash',     label: '💵 מזומן' },
  { k: 'bit',      label: '📱 ביט' },
  { k: 'credit',   label: '💳 אשראי' },
  { k: 'paybox',   label: '📦 Paybox' },
  { k: 'transfer', label: '🏦 העברה' },
]

let _tempId = 0
function nextTempId() { return ++_tempId }

export function WalkInModal({ open, onClose, onSaved, initialCustomer = null }) {
  const toast = useToast()
  const { services } = useServices({ activeOnly: true })
  const { staff } = useStaff({ activeOnly: true })
  const { settings } = useBusinessSettings()

  // cart
  const [cartItems, setCartItems] = useState([])
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')

  // staff / payment
  const [staffId, setStaffId] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [isDebt, setIsDebt] = useState(false)
  const [busy, setBusy] = useState(false)

  // products
  const [products, setProducts] = useState([])
  const [productsOpen, setProductsOpen] = useState(false)

  // top services
  const [topServices, setTopServices] = useState([])

  // customer
  const [customerMode, setCustomerMode] = useState('walkin')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [customerNameManual, setCustomerNameManual] = useState('')

  const supportsContactPicker = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window

  const total = cartItems.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  // Reset on open
  useEffect(() => {
    if (open) {
      setCartItems([])
      setCustomName('')
      setCustomPrice('')
      setStaffId('')
      setPayMethod('cash')
      setIsDebt(false)
      setProductsOpen(false)
      if (initialCustomer?.id) {
        setCustomerMode('search')
        setSelectedCustomer(initialCustomer)
      } else {
        setCustomerMode('walkin')
        setSelectedCustomer(null)
      }
      setCustomerSearch('')
      setCustomerResults([])
      setCustomerNameManual('')
    }
  }, [open, initialCustomer])

  // Load products once
  useEffect(() => {
    if (!open) return
    supabase.from('products').select('id, name, price').eq('is_active', true)
      .order('display_order').then(({ data }) => setProducts(data ?? []))
  }, [open])

  // Top services by appointment frequency
  useEffect(() => {
    if (!open || services.length === 0) return
    async function load() {
      const { data } = await supabase.from('appointments').select('service_id').not('service_id', 'is', null)
      const freq = {}
      ;(data ?? []).forEach(a => { freq[a.service_id] = (freq[a.service_id] ?? 0) + 1 })
      setTopServices([...services].sort((a, b) => (freq[b.id] ?? 0) - (freq[a.id] ?? 0)).slice(0, 8))
    }
    load()
  }, [open, services])

  // Customer search debounced
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('profiles').select('id, name, phone')
        .eq('role', 'customer').or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`).limit(6)
      setCustomerResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  // Cart helpers
  function addToCart(item) {
    setCartItems(prev => {
      const existing = prev.find(i => i.type === item.type && i.id === item.id && item.id !== null)
      if (existing) return prev.map(i => i.tempId === existing.tempId ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { ...item, tempId: nextTempId(), quantity: 1 }]
    })
  }

  function setQty(tempId, qty) {
    if (qty < 1) setCartItems(prev => prev.filter(i => i.tempId !== tempId))
    else setCartItems(prev => prev.map(i => i.tempId === tempId ? { ...i, quantity: qty } : i))
  }

  function addCustomItem() {
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

  async function pickFromDeviceContacts() {
    try {
      const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false })
      if (!contacts?.length) return
      const c = contacts[0]
      const name = c.name?.[0] ?? ''
      const phone = c.tel?.[0] ?? ''
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '').slice(-9)
        const { data } = await supabase.from('profiles').select('id, name, phone')
          .eq('role', 'customer').ilike('phone', `%${cleanPhone}%`).limit(1)
        if (data?.[0]) { pickCustomer(data[0]); return }
      }
      setCustomerNameManual(`${name}${phone ? ' · ' + phone : ''}`)
      setSelectedCustomer(null)
      toast({ message: 'לקוח לא רשום — נשמר כשם בלבד', type: 'info' })
    } catch (e) {
      if (e.name !== 'AbortError') toast({ message: 'שגיאה בגישה לאנשי קשר', type: 'error' })
    }
  }

  async function save() {
    if (cartItems.length === 0) { toast({ message: 'הוסף לפחות פריט אחד', type: 'error' }); return }
    if (isDebt && !selectedCustomer) { toast({ message: 'לחוב נדרש לקוח רשום', type: 'error' }); return }
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const customerName = selectedCustomer?.name || customerNameManual.split(' · ')[0] || ''
      const customerPhone = selectedCustomer?.phone || ''
      const descLine = cartItems.map(i => i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name).join(', ')

      if (isDebt) {
        const { error } = await supabase.from('customer_debts').insert({
          customer_id: selectedCustomer.id,
          amount: total,
          description: descLine,
          status: 'pending',
        })
        if (error) throw error
        toast({ message: 'חוב נרשם ✓', type: 'success' })
        onSaved?.(); onClose(); return
      }

      const vatRate = settings?.vat_rate || 18
      const isPatur = settings?.business_type === 'osek_patur'
      const priceBeforeVat = isPatur ? total : Math.round(total / (1 + vatRate / 100))
      const vatAmount = isPatur ? 0 : total - priceBeforeVat
      const nowIso = new Date().toISOString()
      const staffMember = staff.find(s => s.id === staffId)

      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: null,
        customer_name: customerName,
        customer_phone: customerPhone,
        service_name: descLine,
        staff_name: staffMember?.name || '',
        service_date: nowIso,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: total,
        status: 'paid',
        paid_at: nowIso,
        notes: payMethod,
        document_type: 320,
      }).select().single()
      if (invErr) throw invErr

      // Invoice line items
      const lineItems = cartItems.map(item => ({
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
      await supabase.from('invoice_items').insert(lineItems)

      // Manual income rows (one per cart item)
      const incomeRows = cartItems.map(item => {
        const amt = item.unit_price * item.quantity
        const row = {
          amount: amt,
          description: item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
          customer_name: customerName,
          customer_id: selectedCustomer?.id || null,
          service_id: item.type === 'service' ? item.id : null,
          product_id: item.type === 'product' ? item.id : null,
          staff_id: staffId || null,
          payment_method: payMethod,
          date: today,
        }
        if (!isPatur) row.vat_amount = Math.round(amt / (1 + vatRate / 100) * vatRate / 100)
        return row
      })
      await supabase.from('manual_income').insert(incomeRows)

      toast({ message: 'תקבול נרשם + חשבונית הופקה ✓', type: 'success' })
      onSaved?.()
      onClose()
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="💰 תקבול מהיר">
      <div className="space-y-4">

        {/* Services */}
        {topServices.length > 0 && (
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>שירותים</p>
            <div className="flex flex-wrap gap-2">
              {topServices.map(svc => {
                const inCart = cartItems.find(i => i.type === 'service' && i.id === svc.id)
                return (
                  <button
                    key={svc.id}
                    onClick={() => addToCart({ type: 'service', id: svc.id, name: svc.name, unit_price: Number(svc.price || 0) })}
                    className="text-xs px-3 py-2 rounded-xl font-medium border transition-all"
                    style={inCart
                      ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.15)' }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
                  >
                    {svc.name} — ₪{svc.price}
                    {inCart && <span className="mr-1 font-black">×{inCart.quantity}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Products */}
        {products.length > 0 && (
          <div>
            <button
              onClick={() => setProductsOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: 'var(--color-muted)' }}
            >
              📦 מוצרים <span className="text-[10px]">{productsOpen ? '▲' : '▼'}</span>
            </button>
            {productsOpen && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border p-1.5 space-y-0.5"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                {products.map(p => {
                  const inCart = cartItems.find(i => i.type === 'product' && i.id === p.id)
                  return (
                    <button key={p.id}
                      onClick={() => addToCart({ type: 'product', id: p.id, name: p.name, unit_price: Number(p.price || 0) })}
                      className="w-full text-right px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors"
                      style={inCart
                        ? { background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }
                        : { color: 'var(--color-text)' }}>
                      <span>{p.name}{inCart && <span className="mr-1 font-black text-xs">×{inCart.quantity}</span>}</span>
                      <span className="font-bold text-xs" style={{ color: 'var(--color-gold)' }}>₪{p.price}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Custom item */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-muted)' }}>פריט מותאם</label>
            <input value={customName} onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomItem()}
              className="input w-full text-sm" placeholder="תיאור" />
          </div>
          <div className="w-24">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-muted)' }}>₪</label>
            <input type="number" inputMode="decimal" value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomItem()}
              className="input w-full text-sm text-center" placeholder="0" />
          </div>
          <button onClick={addCustomItem} disabled={!customName.trim() || !Number(customPrice)}
            className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-40 mb-0.5"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>+</button>
        </div>

        {/* Cart */}
        {cartItems.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {cartItems.map(item => (
              <div key={item.tempId}
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{item.name}</span>
                <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>
                  ₪{(item.unit_price * item.quantity).toLocaleString('he-IL')}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(item.tempId, item.quantity - 1)}
                    className="w-6 h-6 rounded-lg text-sm font-black flex items-center justify-center"
                    style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>−</button>
                  <span className="w-5 text-center text-sm font-bold" style={{ color: 'var(--color-text)' }}>{item.quantity}</span>
                  <button onClick={() => setQty(item.tempId, item.quantity + 1)}
                    className="w-6 h-6 rounded-lg text-sm font-black flex items-center justify-center"
                    style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>+</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center px-3 py-2"
              style={{ background: 'var(--color-card)' }}>
              <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>סה״כ</span>
              <span className="text-lg font-black" style={{ color: 'var(--color-gold)' }}>₪{total.toLocaleString('he-IL')}</span>
            </div>
          </div>
        )}

        {/* Customer */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>לקוח</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            <button onClick={() => { setCustomerMode('walkin'); setSelectedCustomer(null); setCustomerSearch(''); setCustomerNameManual(''); setIsDebt(false) }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
              style={customerMode === 'walkin'
                ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              🚶 מזדמן
            </button>
            <button onClick={() => setCustomerMode('search')}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
              style={customerMode === 'search'
                ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              🔍 לקוח רשום
            </button>
            {supportsContactPicker && (
              <button onClick={pickFromDeviceContacts}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                📇 אנשי קשר
              </button>
            )}
          </div>

          {customerMode === 'walkin' && (
            <input value={customerNameManual} onChange={e => setCustomerNameManual(e.target.value)}
              className="input w-full text-sm" placeholder="שם לקוח מזדמן (אופציונלי)" />
          )}

          {customerMode === 'search' && (
            <div className="relative">
              <input
                value={selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ' · ' + selectedCustomer.phone : ''}` : customerSearch}
                onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value) }}
                onClick={() => { if (selectedCustomer) { setSelectedCustomer(null); setCustomerSearch('') } }}
                className="input w-full text-sm" placeholder="חפש לפי שם או טלפון..." />
              {(customerResults.length > 0 || searching) && !selectedCustomer && (
                <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border shadow-lg overflow-hidden"
                  style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  {searching ? (
                    <div className="py-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>מחפש...</div>
                  ) : customerResults.map(c => (
                    <button key={c.id} onClick={() => pickCustomer(c)}
                      className="w-full text-right px-4 py-3 text-sm flex justify-between items-center hover:bg-[var(--color-surface)]"
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

        {/* Staff */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-muted)' }}>ספר (אופציונלי)</label>
          <select value={staffId} onChange={e => setStaffId(e.target.value)} className="input w-full text-sm">
            <option value="">— ללא ספר —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Payment method */}
        {!isDebt && (
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: 'var(--color-muted)' }}>אמצעי תשלום</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m.k} onClick={() => setPayMethod(m.k)}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: payMethod === m.k ? 'var(--color-gold)' : 'var(--color-surface)',
                    color: payMethod === m.k ? '#000' : 'var(--color-text)',
                    border: `1.5px solid ${payMethod === m.k ? 'var(--color-gold)' : 'var(--color-border)'}`,
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Debt toggle */}
        {customerMode === 'search' && selectedCustomer && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
            <input type="checkbox" checked={isDebt} onChange={e => setIsDebt(e.target.checked)}
              className="w-5 h-5" style={{ accentColor: 'var(--color-gold)' }} />
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>📋 השאר כחוב ללקוח</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>לא מופקת חשבונית — עד לתשלום</div>
            </div>
          </label>
        )}

        <button onClick={save} disabled={busy || cartItems.length === 0}
          className="w-full py-3 rounded-xl font-black text-sm disabled:opacity-50"
          style={{ background: 'var(--color-gold)', color: '#000' }}>
          {busy ? 'מעבד...' : isDebt ? '📋 רשום חוב' : `✓ אשר + הפק חשבונית${total ? ' ₪' + total.toLocaleString('he-IL') : ''}`}
        </button>
      </div>
    </Modal>
  )
}
