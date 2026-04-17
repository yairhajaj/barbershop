import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useCustomers } from '../../hooks/useCustomers'
import { formatDateFull, formatDateShort, formatTime, priceDisplay } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  confirmed:           { bg: 'rgba(34,197,94,0.1)',  color: '#16a34a', label: '✅ אושר' },
  pending_reschedule:  { bg: 'rgba(234,179,8,0.1)',  color: '#ca8a04', label: '🕐 ממתין' },
  cancelled:           { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', label: '❌ בוטל' },
  no_show:             { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', label: '🚫 לא הגיע' },
  completed:           { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: '☑ הושלם' },
}

export function Customers() {
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [selectedCustomer, setSelected] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory]         = useState([])
  const [customerDebts, setCustomerDebts] = useState([])
  const debounceRef = useRef(null)

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const { customers, loading, toggleBlock, fetchHistory, refetch } = useCustomers({ search: debouncedSearch })
  const showToast = useToast()
  const [debtMap, setDebtMap] = useState({})

  // Fetch pending debts for all customers whenever customer list changes
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

  // Open customer profile
  async function openCustomer(customer) {
    setSelected(customer)
    setHistory([])
    setCustomerDebts([])
    setHistoryLoading(true)
    try {
      const [data, { data: debts }] = await Promise.all([
        fetchHistory(customer.id),
        supabase
          .from('customer_debts')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
      ])
      setHistory(data)
      setCustomerDebts(debts || [])
    } finally {
      setHistoryLoading(false)
    }
  }

  // Quick block toggle from list
  async function handleBlock(e, customer) {
    e.stopPropagation()
    await toggleBlock(customer.id, !customer.is_blocked)
    showToast({
      message: customer.is_blocked ? `${customer.name} בוטל חסום` : `${customer.name} נחסם`,
      type: customer.is_blocked ? 'success' : 'info',
    })
  }

  // Save to contacts (.vcf)
  function saveToContacts(customer) {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${customer.name}`,
      `TEL;TYPE=CELL:${customer.phone}`,
    ]
    if (customer.email) lines.push(`EMAIL:${customer.email}`)
    lines.push('END:VCARD')

    const blob = new Blob([lines.join('\n')], { type: 'text/vcard' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${customer.name}.vcf`; a.click()
    URL.revokeObjectURL(url)
  }

  // Import from device contacts (mobile only)
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

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', phone)
          .maybeSingle()

        if (!existing) {
          await supabase.from('profiles').insert({
            name:  c.name?.[0] ?? 'ללא שם',
            phone,
            email: c.email?.[0] ?? null,
            role:  'customer',
          })
          added++
        }
      }

      await refetch()
      showToast({ message: `יובאו ${added} לקוחות חדשים`, type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה בייבוא אנשי קשר', type: 'error' })
    }
  }

  // WhatsApp link
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
        {supportsContacts && (
          <button onClick={importContacts} className="btn-ghost text-sm flex items-center gap-1.5">
            📥 ייבא מאנשי קשר
          </button>
        )}
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

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : customers.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-3">👥</div>
          <p className="font-bold" style={{ color: 'var(--color-text)' }}>
            {debouncedSearch ? 'לא נמצאו לקוחות' : 'אין לקוחות עדיין'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {debouncedSearch ? 'נסה חיפוש אחר' : 'לקוחות יופיעו כאן לאחר הזמנת תורים'}
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
              onBlock={e => handleBlock(e, customer)}
              waLink={waLink(customer.phone)}
              pendingDebt={debtMap[customer.id] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Profile Modal */}
      <AnimatePresence>
        {selectedCustomer && (
          <CustomerModal
            customer={selectedCustomer}
            history={history}
            historyLoading={historyLoading}
            customerDebts={customerDebts}
            onClose={() => setSelected(null)}
            onToggleBlock={async () => {
              await toggleBlock(selectedCustomer.id, !selectedCustomer.is_blocked)
              setSelected(c => ({ ...c, is_blocked: !c.is_blocked }))
              showToast({
                message: selectedCustomer.is_blocked ? `${selectedCustomer.name} בוטל חסום` : `${selectedCustomer.name} נחסם`,
                type: 'info',
              })
            }}
            onSaveToContacts={() => saveToContacts(selectedCustomer)}
            waLink={waLink(selectedCustomer.phone)}
          />
        )}
      </AnimatePresence>
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
        border: `1px solid ${customer.is_blocked ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-gold)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(255,122,0,0.08)' }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = customer.is_blocked ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black flex-shrink-0"
          style={{ background: customer.is_blocked ? 'rgba(239,68,68,0.12)' : 'var(--color-gold)', color: customer.is_blocked ? '#dc2626' : '#fff' }}
        >
          {customer.name?.[0] ?? '?'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate" style={{ color: 'var(--color-text)' }}>
              {customer.name}
            </span>
            {customer.is_blocked && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                חסום
              </span>
            )}
            {pendingDebt > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                חוב ₪{pendingDebt}
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-muted)' }}>
            <span>{customer.phone}</span>
            <span>·</span>
            <span>הצטרף: {joinDate}</span>
          </div>
        </div>

        {/* Stats */}
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

        {/* Quick actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <a
            href={`tel:${customer.phone}`}
            title="חייג"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-sm"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.1)'}
          >
            📞
          </a>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            title="WhatsApp"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-sm"
            style={{ background: 'rgba(37,211,102,0.1)', color: '#25d366' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,211,102,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,211,102,0.1)'}
          >
            💬
          </a>
          <button
            onClick={onBlock}
            title={customer.is_blocked ? 'בטל חסימה' : 'חסום לקוח'}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-sm"
            style={{ background: customer.is_blocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: customer.is_blocked ? '#16a34a' : '#dc2626' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
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
function CustomerModal({ customer, history, historyLoading, customerDebts = [], onClose, onToggleBlock, onSaveToContacts, waLink }) {
  const joinDate = customer.created_at ? formatDateFull(new Date(customer.created_at)) : '—'
  const lastDate = customer.lastDate   ? formatDateFull(new Date(customer.lastDate))   : '—'

  return (
    <Modal open={true} onClose={onClose} title={customer.name} size="lg">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto">

        {/* Status + Save */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
              style={customer.is_blocked
                ? { background: 'rgba(239,68,68,0.1)', color: '#dc2626' }
                : { background: 'rgba(34,197,94,0.1)', color: '#16a34a' }
              }
            >
              {customer.is_blocked ? '🚫 חסום' : '✅ פעיל'}
            </span>
            <button
              onClick={onToggleBlock}
              className="text-xs font-bold px-3 py-1 rounded-full transition-all"
              style={{
                background: customer.is_blocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                color: customer.is_blocked ? '#16a34a' : '#dc2626',
              }}
            >
              {customer.is_blocked ? 'בטל חסימה' : 'חסום'}
            </button>
          </div>
          <button
            onClick={onSaveToContacts}
            className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            💾 שמור לאנ&quot;ק
          </button>
        </div>

        {/* Contact Info */}
        <div
          className="rounded-2xl p-4 space-y-2 text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-muted)' }}>📱 טלפון</span>
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: 'var(--color-text)' }}>{customer.phone}</span>
              <a href={`tel:${customer.phone}`} className="text-green-600 hover:text-green-700 text-xs font-bold">📞</a>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600 text-xs font-bold">💬</a>
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
            { label: 'תורים',   value: customer.total,  color: 'var(--color-gold)' },
            { label: 'no-show', value: customer.noShow, color: customer.noShow > 0 ? '#dc2626' : 'var(--color-muted)' },
            { label: 'הוציא',   value: `₪${customer.spent}`, color: 'var(--color-text)' },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-3 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Appointment History */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
            היסטוריית תורים
          </h3>

          {historyLoading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : history.length === 0 ? (
            <div
              className="text-center py-8 rounded-2xl text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
            >
              אין תורים עדיין
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map(appt => {
                const st   = appt.start_at ? new Date(appt.start_at) : null
                const meta = STATUS_COLORS[appt.status] ?? STATUS_COLORS.completed

                return (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between p-3 rounded-xl text-sm"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        {appt.services?.name ?? '—'}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        {st ? `${formatDateShort(st)} · ${formatTime(st)}` : '—'}
                        {appt.staff?.name ? ` · ${appt.staff.name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                      {appt.services?.price != null && (
                        <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>
                          ₪{appt.services.price}
                        </span>
                      )}
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Debt History */}
        {customerDebts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-muted)' }}>
              היסטוריית חובות
            </h3>
            <div className="flex flex-col gap-2">
              {customerDebts.map(d => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-sm"
                  style={{
                    background: d.status === 'paid' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${d.status === 'paid' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}
                >
                  <div>
                    <div className="font-medium" style={{ color: 'var(--color-text)' }}>{d.description}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {formatDateShort(new Date(d.created_at))}
                      {d.status === 'paid' && d.paid_at && ` · שולם ${formatDateShort(new Date(d.paid_at))}`}
                    </div>
                  </div>
                  <div className="font-bold text-sm" style={{ color: d.status === 'paid' ? '#16a34a' : '#dc2626' }}>
                    ₪{Number(d.amount).toLocaleString('he-IL')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
