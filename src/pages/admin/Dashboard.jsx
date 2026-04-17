import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { startOfDay, endOfDay, addDays, format } from 'date-fns'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useStaff } from '../../hooks/useStaff'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBranch } from '../../contexts/BranchContext'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { formatTime, formatDateFull } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import { BUSINESS } from '../../config/business'

export function Dashboard() {
  const today = new Date()
  const toast = useToast()
  const { currentBranch } = useBranch()
  const { staff } = useStaff({ activeOnly: true, branchId: currentBranch?.id ?? null })
  const { settings, saveSettings } = useBusinessSettings()

  // Waitlist
  const [waitlistEntries, setWaitlistEntries] = useState([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [togglingWaitlist, setTogglingWaitlist] = useState(false)

  const waitlistEnabled = settings.waitlist_enabled ?? false

  useEffect(() => {
    if (waitlistEnabled) loadWaitlist()
  }, [waitlistEnabled])

  async function loadWaitlist() {
    setWaitlistLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('*, profiles(name, phone), services(name)')
      .eq('status', 'pending')
      .order('preferred_date', { ascending: true })
      .order('created_at',   { ascending: true })
    setWaitlistEntries(data ?? [])
    setWaitlistLoading(false)
  }

  async function toggleWaitlist() {
    setTogglingWaitlist(true)
    try {
      await saveSettings({ waitlist_enabled: !waitlistEnabled })
    } finally {
      setTogglingWaitlist(false)
    }
  }

  async function removeFromWaitlist(id) {
    await supabase.from('waitlist').update({ status: 'removed' }).eq('id', id)
    setWaitlistEntries(es => es.filter(e => e.id !== id))
  }

  const navigate = useNavigate()

  function handleSchedule(entry) {
    sessionStorage.setItem('waitlist_prefill', JSON.stringify({
      waitlistId:    entry.id,
      customerId:    entry.customer_id,
      customerName:  entry.profiles?.name ?? '',
      customerPhone: entry.profiles?.phone ?? '',
      serviceId:     entry.service_id ?? '',
      staffId:       entry.staff_id   ?? '',
      date:          entry.preferred_date ?? '',
      startTime:     entry.time_from?.slice(0,5) ?? '',
      wlTimeFrom:    entry.time_from?.slice(0,5) ?? '',
      wlTimeTo:      entry.time_to?.slice(0,5)   ?? '',
    }))
    navigate('/admin/appointments')
  }

  const { appointments: todayAppts, loading: loadingToday, refetch } = useAllAppointments({
    startDate: startOfDay(today),
    endDate: endOfDay(today),
    branchId: currentBranch?.id ?? null,
  })

  const { appointments: weekAppts } = useAllAppointments({
    startDate: startOfDay(today),
    endDate: endOfDay(addDays(today, 6)),
    branchId: currentBranch?.id ?? null,
  })

  const confirmed  = todayAppts.filter(a => a.status === 'confirmed')
  const completed  = todayAppts.filter(a => a.status === 'completed')
  const revenue    = completed.reduce((sum, a) => sum + (Number(a.services?.price) || 0), 0)
  const weekRevenue = weekAppts.filter(a => a.status === 'completed').reduce((sum, a) => sum + (Number(a.services?.price) || 0), 0)

  async function markComplete(id) {
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', id)
    await refetch()
    toast({ message: 'תור סומן כהושלם', type: 'success' })
  }


  const stats = [
    { label: 'תורים היום',    value: confirmed.length, icon: '📅', color: 'blue' },
    { label: 'הושלמו',        value: completed.length, icon: '✓',  color: 'green' },
    { label: 'הכנסה היום',    value: `₪${revenue}`,    icon: '₪',  color: 'amber' },
    { label: 'הכנסה שבועית',  value: `₪${weekRevenue}`, icon: '📈', color: 'purple' },
  ]

  const colorMap = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    amber:  'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">לוח בקרה</h1>
          <p className="text-muted text-sm">{formatDateFull(today)}</p>
        </div>
        <Link to="/book/service" className="btn-primary text-sm px-4 py-2">+ קבע תור</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`card p-5 ${colorMap[s.color].split(' ')[0]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{s.icon}</span>
              <span className={`text-2xl font-bold ${colorMap[s.color].split(' ')[1]}`}>{s.value}</span>
            </div>
            <p className="text-sm font-medium text-gray-600">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Gap Closer Quick Settings */}
      <GapCloserCard settings={settings} saveSettings={saveSettings} toast={toast} />

      {/* Waitlist Section */}
      <section className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">📋 רשימת המתנה</h2>
            <p className="text-sm text-muted mt-0.5">
              {waitlistEnabled
                ? `${waitlistEntries.length} ממתינים · לקוחות יקבלו הודעה כשיתפנה תור`
                : 'כבוי — לקוחות לא יוכלו להצטרף לרשימת המתנה'}
            </p>
          </div>
          <button
            onClick={toggleWaitlist}
            disabled={togglingWaitlist}
            className="relative inline-flex w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
            style={{ background: waitlistEnabled ? 'var(--color-gold)' : '#d1d5db' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"
              style={{ right: waitlistEnabled ? '2px' : 'calc(100% - 22px)' }}
            />
          </button>
        </div>

        <AnimatePresence>
          {waitlistEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
                {waitlistLoading ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : waitlistEntries.length === 0 ? (
                  <div className="text-center py-6 text-sm" style={{ color: 'var(--color-muted)' }}>
                    <div className="text-3xl mb-2">📭</div>
                    אין ממתינים ברשימה כרגע
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {waitlistEntries.map(entry => {
                      const dateStr  = entry.preferred_date
                        ? format(new Date(entry.preferred_date + 'T12:00:00'), 'dd.MM')
                        : '—'
                      const timeStr  = `${entry.time_from?.slice(0,5) ?? ''} – ${entry.time_to?.slice(0,5) ?? ''}`
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                              style={{ background: 'var(--color-gold)', color: '#fff' }}
                            >
                              {entry.profiles?.name?.[0] ?? '?'}
                            </div>
                            <div>
                              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                                {entry.profiles?.name}
                              </span>
                              <span className="text-xs mr-2" style={{ color: 'var(--color-muted)' }}>
                                {entry.profiles?.phone}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-xs text-right hidden sm:block" style={{ color: 'var(--color-muted)' }}>
                              <div>{dateStr} · {timeStr}</div>
                              {entry.services?.name && <div>{entry.services.name}</div>}
                            </div>
                            <button
                              onClick={() => handleSchedule(entry)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all"
                              style={{ background: 'rgba(255,122,0,0.12)', color: 'var(--color-gold)', border: '1px solid rgba(255,122,0,0.25)' }}
                              title="עבור לשיבוץ"
                            >📅 שיבוץ</button>
                            <button
                              onClick={() => removeFromWaitlist(entry.id)}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs transition-opacity hover:opacity-60"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}
                              title="הסר מהרשימה"
                            >✕</button>
                          </div>
                        </div>
                      )
                    })}
                    <Link
                      to="/admin/waitlist"
                      className="text-xs font-bold text-center pt-1"
                      style={{ color: 'var(--color-gold)' }}
                    >
                      הצג את כל הרשימה ←
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Today's Schedule + Staff */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">לוח יום — היום</h2>
            <Link to="/admin/appointments" className="text-sm font-medium underline underline-offset-2" style={{ color: 'var(--color-gold)' }}>הצג הכל →</Link>
          </div>

          {loadingToday ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : confirmed.length === 0 ? (
            <div className="card p-8 text-center text-muted">
              <div className="text-3xl mb-2">📭</div>
              <p>אין תורים היום</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {confirmed.sort((a, b) => new Date(a.start_at) - new Date(b.start_at)).map(appt => (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="card p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 text-center py-1 rounded-lg text-sm font-bold text-white"
                        style={{ background: 'var(--color-gold)' }}
                      >
                        {formatTime(appt.start_at)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{appt.profiles?.name}</p>
                        <p className="text-xs text-muted">{appt.services?.name} · {appt.staff?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={appt.status} />
                      <button
                        onClick={() => markComplete(appt.id)}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 transition-colors"
                      >
                        הושלם
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Staff */}
        <div>
          <h2 className="font-semibold text-lg mb-4">הספרים היום</h2>
          <div className="flex flex-col gap-3">
            {staff.map(member => {
              const memberAppts = confirmed.filter(a => a.staff_id === member.id)
              return (
                <div key={member.id} className="card p-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-semibold"
                    style={{ background: 'var(--color-gold)', color: 'white' }}
                  >
                    {member.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted">{memberAppts.length} תורים היום</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Gap Closer Quick Card ─────────────────────────────────────────── */
const MODE_OPTIONS = [
  { value: 'off',      label: 'כבוי',       icon: '⭕', desc: 'ללא פעולה אוטומטית' },
  { value: 'approval', label: 'ידני',       icon: '👆', desc: 'אתה מאשר כל הצעה' },
  { value: 'auto',     label: 'אוטומטי',    icon: '⚡', desc: 'שולח הודעות לבד' },
]

function GapCloserCard({ settings, saveSettings, toast }) {
  const mode = settings?.gap_closer_mode || 'off'
  const threshold = settings?.gap_closer_threshold_minutes || 30
  const advanceHours = settings?.gap_closer_advance_hours ?? 2
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  async function updateField(field, value) {
    setSaving(true)
    try {
      await saveSettings({ [field]: value })
      toast({ message: 'נשמר ✓', type: 'success' })
    } finally {
      setSaving(false)
    }
  }

  const currentMode = MODE_OPTIONS.find(m => m.value === mode) || MODE_OPTIONS[0]

  return (
    <section className="rounded-2xl p-5 mb-6" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧩</span>
          <div>
            <h2 className="font-bold text-sm flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
              Gap Closer
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-all"
                style={{ background: showInfo ? 'var(--color-gold)' : 'var(--color-border)', color: showInfo ? '#fff' : 'var(--color-muted)' }}
              >?</button>
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>מילוי חורים אוטומטי כשתור מתבטל</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode quick toggle */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateField('gap_closer_mode', opt.value)}
                disabled={saving}
                className="px-3 py-1.5 text-[11px] font-bold transition-all"
                style={{
                  background: mode === opt.value ? 'var(--color-gold)' : 'transparent',
                  color: mode === opt.value ? '#fff' : 'var(--color-muted)',
                }}
                title={opt.desc}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-2 py-1 rounded-lg transition-all"
            style={{ color: 'var(--color-muted)' }}
          >
            {expanded ? '▲' : '⚙️'}
          </button>
        </div>
      </div>

      {/* Status line */}
      <div className="mt-3 flex items-center gap-4 text-[11px]" style={{ color: 'var(--color-muted)' }}>
        <span>מצב: <strong style={{ color: mode !== 'off' ? 'var(--color-gold)' : 'var(--color-muted)' }}>{currentMode.label}</strong></span>
        {mode !== 'off' && (
          <>
            <span>סף: <strong>{threshold} דק׳</strong></span>
            <span>הפעלה: <strong>{advanceHours} שע׳ לפני</strong></span>
          </>
        )}
      </div>

      {/* Info tooltip */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-3 rounded-xl text-xs leading-relaxed" style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
              <p className="font-bold mb-1">כשתור מתבטל, המערכת פועלת ב-3 שלבים:</p>
              <p>1️⃣ שולחת הודעה ללקוחות ברשימת המתנה</p>
              <p>2️⃣ מציעה ללקוחות עם תור מאוחר יותר להקדים</p>
              <p>3️⃣ מאפשרת לשתף את החור בקבוצת וואטסאפ</p>
              <p className="mt-1.5" style={{ color: 'var(--color-muted)' }}>
                <strong>ידני</strong> = אתה מאשר כל שלב · <strong>אוטומטי</strong> = הכל קורה לבד
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded settings */}
      <AnimatePresence>
        {expanded && mode !== 'off' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 grid grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text)' }}>סף חור מינימלי (דקות)</label>
                <input
                  className="input w-full text-sm"
                  type="number"
                  min={10} max={120} step={5}
                  value={threshold}
                  onChange={e => updateField('gap_closer_threshold_minutes', parseInt(e.target.value) || 30)}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-muted)' }}>חורים קטנים מ-{threshold} דק׳ לא יפעילו</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text)' }}>שעות לפני החור להתחיל</label>
                <input
                  className="input w-full text-sm"
                  type="number"
                  min={0.5} max={12} step={0.5}
                  value={advanceHours}
                  onChange={e => updateField('gap_closer_advance_hours', parseFloat(e.target.value) || 2)}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-muted)' }}>לא ישלח הודעות מוקדם מדי</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
