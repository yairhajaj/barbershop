import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { useWaitlist } from '../../hooks/useWaitlist'
import { supabase } from '../../lib/supabase'
import { formatDateShort } from '../../lib/utils'

const STATUS_META = {
  pending:  { label: 'ממתין',   color: '#ca8a04', bg: 'rgba(234,179,8,0.1)' },
  notified: { label: 'הופנה',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  booked:   { label: 'הוזמן',   color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
  declined: { label: 'סירב',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  expired:  { label: 'פג תוקף', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
  removed:  { label: 'הוסר',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
}

const STATUS_TABS = [
  { key: 'all',      label: 'הכל' },
  { key: 'pending',  label: 'ממתינים' },
  { key: 'notified', label: 'הופנו' },
  { key: 'booked',   label: 'הוזמנו' },
  { key: 'declined', label: 'סירבו' },
  { key: 'expired',  label: 'פגו' },
]

const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const m = String(totalMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
})

export function Waitlist() {
  const navigate = useNavigate()
  const [statusTab, setStatusTab] = useState('all')
  const { entries, loading, removeEntry, addEntry, refetch } = useWaitlist({ statusFilter: statusTab })
  const showToast = useToast()

  const [showAdd, setShowAdd] = useState(false)

  async function handleRemove(id) {
    await removeEntry(id)
    showToast({ message: 'הוסר מרשימת ההמתנה', type: 'info' })
  }

  function handleSchedule(entry) {
    // Save prefill data to sessionStorage so Appointments page can auto-open the booking modal
    sessionStorage.setItem('waitlist_prefill', JSON.stringify({
      waitlistId:    entry.id,
      customerId:    entry.customer_id,
      customerName:  entry.profiles?.name ?? '',
      customerPhone: entry.profiles?.phone ?? '',
      serviceId:     entry.service_id ?? '',
      staffId:       entry.staff_id   ?? '',
      date:          entry.preferred_date ?? '',
      startTime:     entry.time_from?.slice(0, 5) ?? '',
      wlTimeFrom:    entry.time_from?.slice(0, 5) ?? '',
      wlTimeTo:      entry.time_to?.slice(0, 5)   ?? '',
    }))
    navigate('/admin/appointments')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            📋 רשימת המתנה
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {loading ? '...' : `${entries.length} רשומות`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2 px-4">
          + הוסף ידנית
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={{
              background: statusTab === tab.key ? 'var(--color-gold)' : 'var(--color-card)',
              color:      statusTab === tab.key ? '#fff'              : 'var(--color-muted)',
              border:     `1px solid ${statusTab === tab.key ? 'var(--color-gold)' : 'var(--color-border)'}`,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-3">📋</div>
          <p className="font-bold" style={{ color: 'var(--color-text)' }}>אין רשומות</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            לקוחות יצטרפו לרשימה כשיום מלא
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              index={i}
              onRemove={() => handleRemove(entry.id)}
              onSchedule={() => handleSchedule(entry)}
            />
          ))}
        </div>
      )}

      {/* Add manually modal */}
      {showAdd && (
        <AddWaitlistModal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await addEntry(data)
            setShowAdd(false)
            showToast({ message: 'נוסף לרשימת ההמתנה', type: 'success' })
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function WaitlistRow({ entry, index, onRemove, onSchedule }) {
  const meta     = STATUS_META[entry.status] ?? STATUS_META.pending
  const dateStr  = entry.preferred_date
    ? formatDateShort(new Date(entry.preferred_date + 'T12:00:00'))
    : '—'
  const timeStr  = `${entry.time_from?.slice(0,5) ?? '08:00'} – ${entry.time_to?.slice(0,5) ?? '20:00'}`
  const joinedAgo = entry.created_at
    ? timeAgo(new Date(entry.created_at))
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-black flex-shrink-0 text-sm"
        style={{ background: 'var(--color-gold)', color: '#fff' }}
      >
        {entry.profiles?.name?.[0] ?? '?'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
            {entry.profiles?.name ?? '—'}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-xs mt-0.5 flex gap-2 flex-wrap" style={{ color: 'var(--color-muted)' }}>
          <span>{entry.profiles?.phone ?? ''}</span>
          {entry.services?.name && <><span>·</span><span>{entry.services.name}</span></>}
          {entry.staff?.name    && <><span>·</span><span>✂️ {entry.staff.name}</span></>}
          <span>·</span>
          <span>{dateStr}</span>
          <span>·</span>
          <span>{timeStr}</span>
          {joinedAgo && <><span>·</span><span>{joinedAgo}</span></>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {entry.profiles?.phone && (
          <a
            href={`tel:${entry.profiles.phone}`}
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-sm transition-all"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}
            title="חייג"
          >📞</a>
        )}
        {(entry.status === 'pending' || entry.status === 'notified') && (
          <>
            <button
              onClick={onSchedule}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: 'rgba(255,122,0,0.12)', color: 'var(--color-gold)', border: '1px solid rgba(255,122,0,0.25)' }}
              title="עבור לשיבוץ ידני"
            >
              📅 שיבוץ
            </button>
            <button
              onClick={onRemove}
              className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-sm transition-all"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}
              title="הסר מהרשימה"
            >🗑</button>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function AddWaitlistModal({ onClose, onSave }) {
  const [saving, setSaving] = useState(false)
  const [search, setSearch]     = useState('')
  const [searchRes, setSearchRes] = useState([])
  const [selCustomer, setSelCustomer] = useState(null)
  const [services, setServices] = useState([])
  const [form, setForm] = useState({
    serviceId: '',
    date:      new Date().toISOString().split('T')[0],
    timeFrom:  '08:00',
    timeTo:    '20:00',
  })
  const showToast = useToast()

  // Load services on mount
  useState(() => {
    supabase.from('services').select('id, name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setServices(data ?? []))
  })

  async function searchCustomers(q) {
    setSearch(q)
    if (q.trim().length < 2) { setSearchRes([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(6)
    setSearchRes(data ?? [])
  }

  async function handleSave() {
    if (!selCustomer) { showToast({ message: 'בחר לקוח', type: 'error' }); return }
    if (!form.date)   { showToast({ message: 'בחר תאריך', type: 'error' }); return }
    setSaving(true)
    try {
      await onSave({
        customer_id:    selCustomer.id,
        service_id:     form.serviceId || null,
        preferred_date: form.date,
        time_from:      form.timeFrom,
        time_to:        form.timeTo,
      })
    } catch (err) {
      showToast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="הוסף לרשימת המתנה" size="sm">
      <div className="space-y-4">
        {/* Customer search */}
        <div>
          <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>לקוח *</label>
          {selCustomer ? (
            <div className="flex items-center justify-between input">
              <span>{selCustomer.name} · {selCustomer.phone}</span>
              <button onClick={() => setSelCustomer(null)} className="text-xs" style={{ color: 'var(--color-muted)' }}>✕</button>
            </div>
          ) : (
            <div className="relative">
              <input
                className="input"
                placeholder="חפש לפי שם / טלפון..."
                value={search}
                onChange={e => searchCustomers(e.target.value)}
              />
              {searchRes.length > 0 && (
                <div
                  className="absolute top-full mt-1 w-full rounded-xl shadow-xl z-10 overflow-hidden"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                >
                  {searchRes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelCustomer(c); setSearchRes([]); setSearch('') }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)' }}
                    >
                      <span className="font-bold">{c.name}</span>
                      <span className="ml-2" style={{ color: 'var(--color-muted)' }}>{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Service */}
        <div>
          <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>שירות (אופציונלי)</label>
          <select className="input" value={form.serviceId} onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}>
            <option value="">כל שירות</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>תאריך *</label>
          <input
            type="date"
            className="input"
            value={form.date}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>שעה מ</label>
            <select className="input" value={form.timeFrom} onChange={e => setForm(f => ({ ...f, timeFrom: e.target.value }))}>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>שעה עד</label>
            <select className="input" value={form.timeTo} onChange={e => setForm(f => ({ ...f, timeTo: e.target.value }))}>
              {TIME_OPTIONS.filter(t => t > form.timeFrom).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center py-3">
          {saving ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'הוסף לרשימה'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(date) {
  const diff = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 60)   return `לפני ${mins} דק'`
  const hours = Math.floor(mins / 60)
  if (hours < 24)  return `לפני ${hours} שע'`
  const days  = Math.floor(hours / 24)
  return `לפני ${days} ימים`
}
