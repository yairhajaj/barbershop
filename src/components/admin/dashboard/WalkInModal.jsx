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

/**
 * Quick walk-in receipt modal.
 *
 * Features:
 * - Top-used services as quick buttons (sync price → amount + description)
 * - Products picker (collapsible, not crowding UI)
 * - Customer: walk-in / registered (search by name or phone) / device contacts
 * - Save as debt (no invoice, goes to customer_debts)
 * - Otherwise: creates invoice + manual_income
 */
export function WalkInModal({ open, onClose, onSaved, initialCustomer = null }) {
  const toast = useToast()
  const { services } = useServices({ activeOnly: true })
  const { staff } = useStaff({ activeOnly: true })
  const { settings } = useBusinessSettings()

  // form
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [staffId, setStaffId] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [isDebt, setIsDebt] = useState(false)
  const [busy, setBusy] = useState(false)

  // products
  const [products, setProducts] = useState([])
  const [productsOpen, setProductsOpen] = useState(false)

  // top services (by usage frequency)
  const [topServices, setTopServices] = useState([])

  // customer mode
  const [customerMode, setCustomerMode] = useState('walkin') // walkin | search
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [customerNameManual, setCustomerNameManual] = useState('')

  const supportsContactPicker = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount('')
      setDescription('')
      setSelectedService(null)
      setSelectedProduct(null)
      setStaffId('')
      setPayMethod('cash')
      setIsDebt(false)
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
      setProductsOpen(false)
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
  }, [open, services])

  // Customer search (debounced)
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
    setSelectedService(svc)
    setSelectedProduct(null)
    setAmount(String(svc.price ?? ''))
    setDescription(svc.name)
  }

  function pickProduct(prod) {
    setSelectedProduct(prod)
    setSelectedService(null)
    setAmount(String(prod.price ?? ''))
    setDescription(prod.name)
    setProductsOpen(false)
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
      // Try to match to existing customer
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '').slice(-9)
        const { data } = await supabase
          .from('profiles')
          .select('id, name, phone')
          .eq('role', 'customer')
          .ilike('phone', `%${cleanPhone}%`)
          .limit(1)
        if (data?.[0]) {
          pickCustomer(data[0])
          return
        }
      }
      // Not registered — store as manual name
      setCustomerNameManual(`${name}${phone ? ' · ' + phone : ''}`)
      setSelectedCustomer(null)
      toast({ message: 'לקוח לא רשום במערכת — נשמר כשם בלבד', type: 'info' })
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast({ message: 'שגיאה בגישה לאנשי קשר', type: 'error' })
      }
    }
  }

  async function save() {
    const price = Number(amount)
    if (!price || price <= 0) {
      toast({ message: 'הזן סכום', type: 'error' })
      return
    }
    if (!description.trim()) {
      toast({ message: 'הזן תיאור או בחר שירות/מוצר', type: 'error' })
      return
    }
    if (isDebt && !selectedCustomer) {
      toast({ message: 'לחוב נדרש לקוח רשום', type: 'error' })
      return
    }
    setBusy(true)
    try {
      if (isDebt) {
        // Debt only — no invoice, no income
        const { error } = await supabase.from('customer_debts').insert({
          customer_id: selectedCustomer.id,
          amount: price,
          description: description.trim(),
          status: 'pending',
        })
        if (error) throw error
        toast({ message: 'חוב נרשם ללקוח ✓', type: 'success' })
        onSaved?.()
        onClose()
        return
      }

      const vatRate = settings?.vat_rate || 18
      const isPatur = settings?.business_type === 'osek_patur'
      const priceBeforeVat = isPatur ? price : Math.round(price / (1 + vatRate / 100))
      const vatAmount = isPatur ? 0 : price - priceBeforeVat
      const nowIso = new Date().toISOString()
      const today = nowIso.slice(0, 10)

      const staffMember = staff.find(s => s.id === staffId)
      const customerName = selectedCustomer?.name || customerNameManual.split(' · ')[0] || ''
      const customerPhone = selectedCustomer?.phone || ''

      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')

      await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: null,
        customer_name: customerName,
        customer_phone: customerPhone,
        service_name: description.trim(),
        staff_name: staffMember?.name || '',
        service_date: nowIso,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: price,
        status: 'paid',
        paid_at: nowIso,
        notes: payMethod,
      })

      await supabase.from('manual_income').insert({
        amount: price,
        vat_amount: vatAmount,
        description: description.trim(),
        customer_name: customerName,
        staff_id: staffId || null,
        service_id: selectedService?.id || null,
        appointment_id: null,
        payment_method: payMethod,
        date: today,
      })

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
        {/* Service quick buttons */}
        {topServices.length > 0 && (
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>שירות</p>
            <div className="flex flex-wrap gap-2">
              {topServices.map(svc => (
                <button
                  key={svc.id}
                  onClick={() => pickService(svc)}
                  className="text-xs px-3 py-2 rounded-xl font-medium border transition-all"
                  style={selectedService?.id === svc.id
                    ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface)' }}
                >
                  {svc.name} — ₪{svc.price}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Products collapsible */}
        {products.length > 0 && (
          <div>
            <button
              onClick={() => setProductsOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: 'var(--color-muted)' }}
            >
              📦 מוצרים <span className="text-[10px]">{productsOpen ? '▲' : '▼'}</span>
              {selectedProduct && <span style={{ color: 'var(--color-gold)' }}>· {selectedProduct.name}</span>}
            </button>
            {productsOpen && (
              <div
                className="mt-2 max-h-44 overflow-y-auto rounded-xl border p-1.5 space-y-0.5"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {products.map(p => (
                  <button
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    className="w-full text-right px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors"
                    style={selectedProduct?.id === p.id
                      ? { background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }
                      : { color: 'var(--color-text)' }}
                  >
                    <span>{p.name}</span>
                    <span className="font-bold text-xs" style={{ color: 'var(--color-gold)' }}>₪{p.price}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Description + amount */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text)' }}>תיאור</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input w-full text-sm"
              placeholder="שם שירות / מוצר"
            />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text)' }}>סכום ₪</label>
            <input
              type="number" inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input w-full text-lg font-black text-center"
              placeholder="0"
            />
          </div>
        </div>

        {/* Customer selector */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>לקוח</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            <button
              onClick={() => { setCustomerMode('walkin'); setSelectedCustomer(null); setCustomerSearch(''); setCustomerNameManual(''); setIsDebt(false) }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
              style={customerMode === 'walkin'
                ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
            >
              🚶 מזדמן
            </button>
            <button
              onClick={() => setCustomerMode('search')}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
              style={customerMode === 'search'
                ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold)', background: 'rgba(201,169,110,0.12)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
            >
              🔍 לקוח רשום
            </button>
            {supportsContactPicker && (
              <button
                onClick={pickFromDeviceContacts}
                className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-all"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
              >
                📇 אנשי קשר
              </button>
            )}
          </div>

          {customerMode === 'walkin' && (
            <input
              value={customerNameManual}
              onChange={e => setCustomerNameManual(e.target.value)}
              className="input w-full text-sm"
              placeholder="שם לקוח מזדמן (אופציונלי)"
            />
          )}

          {customerMode === 'search' && (
            <div className="relative">
              <input
                value={selectedCustomer
                  ? `${selectedCustomer.name}${selectedCustomer.phone ? ' · ' + selectedCustomer.phone : ''}`
                  : customerSearch}
                onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value) }}
                onClick={() => { if (selectedCustomer) { setSelectedCustomer(null); setCustomerSearch('') } }}
                className="input w-full text-sm"
                placeholder="חפש לפי שם או טלפון..."
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
                      className="w-full text-right px-4 py-3 text-sm flex justify-between items-center hover:bg-[var(--color-surface)]"
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

        {/* Staff (optional) */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-muted)' }}>ספר (אופציונלי)</label>
          <select value={staffId} onChange={e => setStaffId(e.target.value)} className="input w-full text-sm">
            <option value="">— ללא ספר —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Payment method (hidden when saving as debt) */}
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

        {/* Debt toggle — only if existing customer selected */}
        {customerMode === 'search' && selectedCustomer && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
            <input
              type="checkbox"
              checked={isDebt}
              onChange={e => setIsDebt(e.target.checked)}
              className="w-5 h-5"
              style={{ accentColor: 'var(--color-gold)' }}
            />
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>📋 השאר כחוב ללקוח</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>לא מופקת חשבונית — עד לתשלום</div>
            </div>
          </label>
        )}

        <button onClick={save} disabled={busy}
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-gold)', color: '#000', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'מעבד...' : isDebt ? '📋 רשום חוב' : '✓ אשר + הפק חשבונית'}
        </button>
      </div>
    </Modal>
  )
}
