import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { AdminSkeleton } from '../../components/feedback/AdminSkeleton'
import { useToast } from '../../components/ui/Toast'
import { useCustomers } from '../../hooks/useCustomers'
import { useCustomerDebts } from '../../hooks/useCustomerDebts'
import { formatDateFull, formatDateShort, formatTime } from '../../lib/utils'
import { printInvoice } from '../../lib/invoice'
import { BUSINESS } from '../../config/business'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { supabase } from '../../lib/supabase'
import { WalkInModal } from '../../components/admin/dashboard/WalkInModal'

const STATUS_COLORS = {
  confirmed:          { bg: 'var(--color-success-tint)',   color: '#16a34a', label: '✅ אושר' },
  pending_reschedule: { bg: 'rgba(234,179,8,0.1)',   color: '#ca8a04', label: '🕐 ממתין' },
  cancelled:          { bg: 'var(--color-danger-tint)',  color: '#dc2626', label: '❌ בוטל' },
  no_show:            { bg: 'var(--color-danger-tint)',  color: '#dc2626', label: '🚫 לא הגיע' },
  completed:          { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: '☑ הושלם' },
}

export function Customers() {
  const navigate  = useNavigate()
  const [search, setSearch]             = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [selectedCustomer, setSelected] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory]           = useState([])
  const [purchases, setPurchases]       = useState([])
  const [addOpen, setAddOpen]           = useState(false)
  const [sellOpen, setSellOpen]         = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const { customers, loading, toggleBlock, fetchHistory, refetch } = useCustomers({ search: debouncedSearch })
  const showToast = useToast()
  const [debtMap, setDebtMap] = useState({})

  // Fetch pending debts for all customers to show badges in list
  useEffect(() => {
    if (!customers?.length) return
    const ids = customers.map(c => c.id)
    supabase
      .from('customer_debts')
      .select('customer_id, amount')
      .eq('status', 'pending')
      .in('customer_id', ids)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(row => {
          map[row.customer_id] = (map[row.customer_id] ?? 0) + Number(row.amount)
        })
        setDebtMap(map)
      })
  }, [customers])

  const supportsContacts = typeof navigator !== 'undefined' && 'contacts' in navigator

  async function openCustomer(customer) {
    setSelected(customer)
    setHistory([])
    setPurchases([])
    setHistoryLoading(true)
    try {
      const { appointments, purchases: prods } = await fetchHistory(customer.id)
      setHistory(appointments)
      setPurchases(prods)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleToggleBlock(customer, block) {
    await toggleBlock(customer.id, block)
    setSelected(c => c ? { ...c, is_blocked: block } : c)
    await refetch()
    showToast({
      message: block ? `${customer.name} נחסם` : `${customer.name} בוטל חסום`,
      type: block ? 'info' : 'success',
    })
  }

  function saveToContacts(customer) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${customer.name}`, `TEL;TYPE=CELL:${customer.phone}`]
    if (customer.email) lines.push(`EMAIL:${customer.email}`)
    lines.push('END:VCARD')
    const blob = new Blob([lines.join('\n')], { type: 'text/vcard' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${customer.name}.vcf`; a.click()
    URL.revokeObjectURL(url)
  }

  async function importContacts() {
    if (!supportsContacts) return
    try {
      const contacts = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true })
      if (!contacts || contacts.length === 0) return
      let added = 0
      for (const c of contacts) {
        const rawPhone = c.tel?.[0]
        if (!rawPhone) continue
        const phone = rawPhone.replace(/\D/g, '')
        const { data: existing } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()
        if (!existing) {
          await supabase.from('profiles').insert({ name: c.name?.[0] ?? 'ללא שם', phone, email: c.email?.[0] ?? null, role: 'customer', is_guest: true })
          added++
        }
      }
      await refetch()
      showToast({ message: `יובאו ${added} לקוחות חדשים`, type: 'success' })
    } catch {
      showToast({ message: 'שגיאה בייבוא אנשי קשר', type: 'error' })
    }
  }

  function handleBookForCustomer(customer) {
    sessionStorage.setItem('customer_prefill', JSON.stringify({
      customerId:   customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    }))
    navigate('/admin/appointments')
  }

  function waLink(phone) {
    const digits = phone.replace(/\D/g, '').replace(/^0/, '972')
    return `https://wa.me/${digits}`
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            👥 לקוחות
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {loading ? '...' : `${customers.length} לקוחות`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {supportsContacts && (
            <button onClick={importContacts} className="btn-ghost text-sm flex items-center gap-1.5">
              📥 ייבא מאנ&quot;ק
            </button>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="btn-primary text-sm flex items-center gap-1.5 px-4 py-2"
          >
            + הוסף לקוח
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <span className="absolute top-1/2 -translate-y-1/2 right-3 text-base" style={{ color: 'var(--color-muted)' }}>🔍</span>
        <input
          className="input pr-9"
          placeholder="חיפוש לפי שם או טלפון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <AdminSkeleton />
      ) : customers.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-5xl mb-3">👥</div>
          <p className="font-bold" style={{ color: 'var(--color-text)' }}>
            {debouncedSearch ? 'לא נמצאו לקוחות' : 'אין לקוחות עדיין'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {debouncedSearch ? 'נסה חיפוש אחר' : 'לחץ "+ הוסף לקוח" כדי להתחיל'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((customer, i) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              index={i}
              onOpen={() => openCustomer(customer)}
              onBlock={e => { e.stopPropagation(); handleToggleBlock(customer, !customer.is_blocked) }}
              waLink={waLink(customer.phone)}
              pendingDebt={debtMap[customer.id] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Customer Profile Modal */}
      <AnimatePresence>
        {selectedCustomer && (
          <CustomerModal
            customer={selectedCustomer}
            history={history}
            purchases={purchases}
            historyLoading={historyLoading}
            onClose={() => setSelected(null)}
            onToggleBlock={handleToggleBlock}
            onSaveToContacts={() => saveToContacts(selectedCustomer)}
            onBookAppointment={() => handleBookForCustomer(selectedCustomer)}
            onSellProduct={() => setSellOpen(true)}
            waLink={waLink(selectedCustomer.phone)}
          />
        )}
      </AnimatePresence>

      {/* Add Customer Modal */}
      {addOpen && (
        <AddCustomerModal
          onClose={() => setAddOpen(false)}
          onAdded={() => { refetch(); setAddOpen(false) }}
        />
      )}

      {/* Sell Product to Customer */}
      <WalkInModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        onSaved={() => {
          setSellOpen(false)
          if (selectedCustomer) {
            fetchHistory(selectedCustomer.id).then(({ purchases: prods }) => setPurchases(prods ?? []))
          }
          showToast({ message: 'מכירת מוצר נרשמה ✓', type: 'success' })
        }}
        initialCustomer={selectedCustomer}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Row
// ─────────────────────────────────────────────────────────────────────────────
function CustomerRow({ customer, index, onOpen, onBlock, waLink, pendingDebt = 0 }) {
  const joinDate = customer.created_at ? formatDateShort(new Date(customer.created_at)) : '—'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={onOpen}
      className="rounded-2xl p-4 cursor-pointer transition-all"
      style={{
        background: customer.is_blocked ? 'rgba(239,68,68,0.04)' : 'var(--color-card)',
        border: `1px solid ${customer.is_blocked ? 'var(--color-danger-ring)' : 'var(--color-border)'}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-gold)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = customer.is_blocked ? 'var(--color-danger-ring)' : 'var(--color-border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black flex-shrink-0"
          style={{ background: customer.is_blocked ? 'rgba(239,68,68,0.12)' : 'var(--color-gold)', color: customer.is_blocked ? '#dc2626' : '#fff' }}
        >
          {customer.name?.[0] ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm truncate" style={{ color: 'var(--color-text)' }}>{customer.name}</span>
            {customer.is_blocked && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-danger-tint)', color: '#dc2626' }}>חסום</span>
            )}
            {pendingDebt > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-danger-tint)', color: '#dc2626' }}>חוב ₪{pendingDebt}</span>
            )}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
            <span>{customer.phone}</span>
            <span>·</span>
            <span>הצטרף: {joinDate}</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-center ml-2">
          <div>
            <div className="text-base font-black" style={{ color: 'var(--color-text)' }}>{customer.total}</div>
            <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>תורים</div>
          </div>
          {customer.noShow > 0 && (
            <div>
              <div className="text-base font-black" style={{ color: '#dc2626' }}>{customer.noShow}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>no-show</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <a href={`tel:${customer.phone}`} className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-sm" style={{ background: 'var(--color-success-tint)', color: '#16a34a' }}>📞</a>
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(37,211,102,0.1)', color: '#25d366' }}>💬</a>
          <button onClick={onBlock} className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-sm" style={{ background: customer.is_blocked ? 'var(--color-success-tint)' : 'var(--color-danger-tint)', color: customer.is_blocked ? '#16a34a' : '#dc2626' }}>
            {customer.is_blocked ? '✅' : '🚫'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Modal
// ─────────────────────────────────────────────────────────────────────────────
function CustomerModal({ customer, history, purchases, historyLoading, onClose, onToggleBlock, onSaveToContacts, onBookAppointment, onSellProduct, waLink }) {
  const showToast = useToast()
  const { settings } = useBusinessSettings()
  const { debts, totalPending, createDebt, markPaid, fetchDebts } = useCustomerDebts({ customerId: customer.id })
  const [debtOpen, setDebtOpen]       = useState(false)
  const [debtForm, setDebtForm]       = useState({ amount: '', description: '' })
  const [debtSaving, setDebtSaving]   = useState(false)
  const [blockConfirm, setBlockConfirm] = useState(false)

  const joinDate = customer.created_at ? formatDateFull(new Date(customer.created_at)) : '—'
  const lastDate = customer.lastDate   ? formatDateFull(new Date(customer.lastDate))   : '—'
  const noShows  = history.filter(a => a.status === 'no_show')
  const pendingDebts = debts.filter(d => d.status === 'pending')

  async function handleSaveDebt() {
    if (!debtForm.amount || Number(debtForm.amount) <= 0) return
    setDebtSaving(true)
    try {
      await createDebt({ customer_id: customer.id, amount: Number(debtForm.amount), description: debtForm.description })
      showToast({ message: 'חוב נשמר ✓', type: 'success' })
      setDebtForm({ amount: '', description: '' })
      setDebtOpen(false)
    } catch (e) {
      showToast({ message: e.message, type: 'error' })
    } finally {
      setDebtSaving(false)
    }
  }

  async function handleMarkPaid(debtId) {
    try {
      await markPaid(debtId)
      showToast({ message: 'חוב סומן כשולם ✓', type: 'success' })
    } catch (e) {
      showToast({ message: e.message, type: 'error' })
    }
  }

  function handlePrintInvoice(appt, inv) {
    const apptObj = {
      id: appt.id,
      start_at: appt.start_at,
      profiles: { name: customer.name, phone: customer.phone },
      services: appt.services,
      staff: appt.staff,
    }
    printInvoice({
      appointment: apptObj,
      business: BUSINESS,
      footerText: settings?.invoice_footer_text,
      vatRate: inv.vat_rate || settings?.vat_rate || 18,
      businessType: settings?.business_type || 'osek_morsheh',
      invoiceNumber: inv.invoice_number,
      businessTaxId: settings?.business_tax_id,
      paymentMethod: inv.notes,
      invoiceDate: inv.created_at,
      logoUrl: settings?.logo_url,
    })
  }

  return (
    <Modal open={true} onClose={onClose} title={customer.name} size="lg">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto">

        {/* Status row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
              style={customer.is_blocked ? { background: 'var(--color-danger-tint)', color: '#dc2626' } : { background: 'var(--color-success-tint)', color: '#16a34a' }}>
              {customer.is_blocked ? '🚫 חסום' : '✅ פעיל'}
            </span>
            {totalPending > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--color-danger-tint)', color: '#dc2626' }}>
                💳 חוב ₪{totalPending}
              </span>
            )}
          </div>
          <button onClick={onSaveToContacts} className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            💾 שמור לאנ&quot;ק
          </button>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onBookAppointment}
            className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
            style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1.5px solid var(--color-gold-ring)' }}
          >
            📅 קבע תור
          </button>
          {onSellProduct && (
            <button
              onClick={onSellProduct}
              className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
              style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}
            >
              📦 מכור מוצר
            </button>
          )}
          <button
            onClick={() => setDebtOpen(true)}
            className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
            style={{ background: 'var(--color-warning-tint)', color: '#d97706', border: '1.5px solid var(--color-warning-ring)' }}
          >
            💳 הוסף חוב
          </button>
          <button
            onClick={() => setBlockConfirm(true)}
            className="py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
            style={customer.is_blocked
              ? { background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }
              : { background: 'var(--color-danger-tint)', color: '#dc2626', border: '1.5px solid var(--color-danger-ring)' }
            }
          >
            {customer.is_blocked ? '✅ בטל חסימה' : '🚫 חסום'}
          </button>
        </div>

        {/* Contact info */}
        <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-muted)' }}>📱 טלפון</span>
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: 'var(--color-text)' }}>{customer.phone}</span>
              <a href={`tel:${customer.phone}`} className="text-green-600 text-xs font-bold">📞</a>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-green-500 text-xs font-bold">💬</a>
            </div>
          </div>
          {customer.email && (
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--color-muted)' }}>📧 אימייל</span>
              <span className="font-bold" style={{ color: 'var(--color-text)' }}>{customer.email}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-muted)' }}>📅 הצטרף</span>
            <span className="font-bold" style={{ color: 'var(--color-text)' }}>{joinDate}</span>
          </div>
          {customer.lastDate && (
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--color-muted)' }}>🕐 ביקור אחרון</span>
              <span className="font-bold" style={{ color: 'var(--color-text)' }}>{lastDate}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'תורים',   value: customer.total,       color: 'var(--color-gold)' },
            { label: 'לא הגיע', value: customer.noShow,      color: customer.noShow > 0 ? '#dc2626' : 'var(--color-muted)' },
            { label: 'הוציא',   value: `₪${customer.spent}`, color: 'var(--color-text)' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Debts section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>חובות פתוחים</h3>
            {pendingDebts.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-danger-tint)', color: '#dc2626' }}>
                ₪{totalPending} סה"כ
              </span>
            )}
          </div>
          {pendingDebts.length === 0 ? (
            <div className="text-center py-3 rounded-xl text-sm" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', color: '#16a34a' }}>
              ✓ אין חובות פתוחים
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingDebts.map(d => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{d.description || 'חוב'}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{formatDateShort(new Date(d.created_at))}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm" style={{ color: '#dc2626' }}>₪{Number(d.amount).toLocaleString('he-IL')}</span>
                    <button
                      onClick={() => handleMarkPaid(d.id)}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}
                    >
                      שולם ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* No-show callout */}
        {noShows.length > 0 && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <div className="text-sm font-bold" style={{ color: '#dc2626' }}>🚫 לא הגיע {noShows.length} פעמים</div>
            <div className="text-xs mt-1.5 flex flex-col gap-1" style={{ color: '#dc2626', opacity: 0.8 }}>
              {noShows.slice(0, 3).map(a => (
                <span key={a.id}>{a.start_at ? formatDateShort(new Date(a.start_at)) : '—'} · {a.services?.name ?? '—'}</span>
              ))}
              {noShows.length > 3 && <span>ועוד {noShows.length - 3}...</span>}
            </div>
          </div>
        )}

        {/* Appointment history */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>היסטוריית תורים</h3>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 rounded-2xl text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
              אין תורים עדיין
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map(appt => {
                const st   = appt.start_at ? new Date(appt.start_at) : null
                const meta = STATUS_COLORS[appt.status] ?? STATUS_COLORS.completed
                const inv  = appt.invoices?.[0]
                return (
                  <div key={appt.id} className="p-3 rounded-xl text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>{appt.services?.name ?? '—'}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          {st ? `${formatDateShort(st)} · ${formatTime(st)}` : '—'}
                          {appt.staff?.name ? ` · ${appt.staff.name}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                        {appt.services?.price != null && (
                          <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>₪{appt.services.price}</span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                      </div>
                    </div>
                    {inv && (
                      <button
                        onClick={() => handlePrintInvoice(appt, inv)}
                        className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                        style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold-ring)' }}
                      >
                        🧾 חשבונית {inv.invoice_number}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* Product purchases */}
        {purchases.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>📦 מוצרים שנרכשו</h3>
            <div className="flex flex-col gap-2">
              {purchases.map(p => {
                let dateStr = ''
                try { dateStr = p.date ? formatDateShort(new Date(p.date)) : '—' } catch { dateStr = '—' }
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>{p.products?.name ?? 'מוצר'}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{dateStr}</div>
                    </div>
                    <span className="font-bold text-sm flex-shrink-0" style={{ color: '#16a34a' }}>₪{Number(p.amount).toLocaleString('he-IL')}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add debt modal */}
      {debtOpen && (
        <Modal open={true} onClose={() => setDebtOpen(false)} title="💳 הוספת חוב">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">סכום (₪)</label>
              <input type="number" min="0" value={debtForm.amount} onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }} placeholder="0" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <input type="text" value={debtForm.description} onChange={e => setDebtForm(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }} placeholder="סיבת החוב..." />
            </div>
            <button onClick={handleSaveDebt} disabled={debtSaving || !debtForm.amount}
              className="w-full py-2.5 rounded-xl font-bold text-sm" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1.5px solid var(--color-warning-ring)' }}>
              {debtSaving ? 'שומר...' : 'שמור חוב'}
            </button>
          </div>
        </Modal>
      )}

      {/* Block confirmation */}
      {blockConfirm && (
        <Modal open={true} onClose={() => setBlockConfirm(false)} title={customer.is_blocked ? 'בטל חסימה' : 'חסימת לקוח'}>
          <div className="space-y-4 text-center">
            <div className="text-4xl">{customer.is_blocked ? '✅' : '🚫'}</div>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {customer.is_blocked
                ? `לבטל את חסימת ${customer.name}?`
                : `לחסום את ${customer.name}? הלקוח לא יוכל לקבוע תורים.`}
            </p>
            {!customer.is_blocked && totalPending > 0 && (
              <p className="text-xs font-bold" style={{ color: '#d97706' }}>⚠️ ללקוח חוב פתוח של ₪{totalPending}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setBlockConfirm(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                ביטול
              </button>
              <button
                onClick={async () => { await onToggleBlock(customer, !customer.is_blocked); setBlockConfirm(false) }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                style={{ background: customer.is_blocked ? '#16a34a' : '#dc2626' }}
              >
                {customer.is_blocked ? 'בטל חסימה' : 'חסום לקוח'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Customer Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddCustomerModal({ onClose, onAdded }) {
  const showToast = useToast()
  const [form, setForm]     = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    setSaving(true)
    try {
      const phone = form.phone.replace(/\D/g, '')
      const { data: existing } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle()
      if (existing) { showToast({ message: 'לקוח עם מספר זה כבר קיים', type: 'error' }); return }
      const { error } = await supabase.from('profiles').insert({
        name: form.name.trim(),
        phone,
        email: form.email.trim() || null,
        role: 'customer',
        is_guest: true,
      })
      if (error) throw error
      showToast({ message: `${form.name} נוסף בהצלחה ✓`, type: 'success' })
      onAdded()
    } catch (e) {
      showToast({ message: e.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="+ הוספת לקוח חדש">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">שם מלא *</label>
          <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="ישראל ישראלי" autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">טלפון *</label>
          <input required type="tel" dir="ltr" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="050-0000000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">אימייל <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>(אופציונלי)</span></label>
          <input type="email" dir="ltr" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
            placeholder="email@example.com" />
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          💡 אם הלקוח ירשם לאפליקציה עם אותו טלפון — הוא יראה את כל ההיסטוריה שלו.
        </p>
        <button type="submit" disabled={saving} className="w-full btn-primary justify-center py-2.5">
          {saving ? 'שומר...' : '+ הוסף לקוח'}
        </button>
      </form>
    </Modal>
  )
}
