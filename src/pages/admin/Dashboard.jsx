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
  const [gapAnalysis, setGapAnalysis] = useState([])
  const [showGaps, setShowGaps] = useState(false)
  const [analyzingGaps, setAnalyzingGaps] = useState(false)

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

  // ── Gap Closer ──────────────────────────────────────────────────
  function analyzeGaps() {
    setAnalyzingGaps(true)
    const sorted = [...confirmed].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    const gaps = []

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      const gapMin = (new Date(next.start_at) - new Date(curr.end_at)) / 60000

      if (gapMin >= 15) {
        gaps.push({
          gapStart: new Date(curr.end_at),
          gapEnd: new Date(next.start_at),
          gapMin: Math.round(gapMin),
          afterAppt: curr,
          beforeAppt: next,
        })
      }
    }

    setGapAnalysis(gaps)
    setShowGaps(true)
    setAnalyzingGaps(false)
    toast({ message: gaps.length > 0 ? `נמצאו ${gaps.length} חורים ביומן` : 'היומן צמוד — אין חורים גדולים', type: gaps.length > 0 ? 'warning' : 'success' })
  }

  function whatsappLink(appt, gapStart) {
    const name = appt.profiles?.name ?? ''
    const phone = appt.profiles?.phone?.replace(/[^0-9]/g, '') ?? ''
    const intlPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone
    const time = formatTime(gapStart)
    const msg = encodeURIComponent(
      `שלום ${name} 😊\nנפתחה שעה ב-${time} במספרה שלנו.\nהאם תרצה/י להזיז את התור שלך לשעה ${time}?\nענה/י כן או לא, תודה!`
    )
    return `https://wa.me/${intlPhone}?text=${msg}`
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

      {/* Gap Closer Panel */}
      <section className="card p-5 mb-6 border-2 border-dashed border-amber-200 bg-amber-50/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Gap Closer — צמצום חורים</h2>
            <p className="text-sm text-muted">סרוק את היומן וצור קשר עם לקוחות לגבי שעות שהתפנו</p>
          </div>
          <button
            onClick={analyzeGaps}
            disabled={analyzingGaps || loadingToday}
            className="btn-primary text-sm px-4 py-2"
          >
            {analyzingGaps ? <Spinner size="sm" className="border-white border-t-transparent" /> : '🔍 נתח עכשיו'}
          </button>
        </div>

        <AnimatePresence>
          {showGaps && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              {gapAnalysis.length === 0 ? (
                <div className="text-center py-4 text-green-700 font-medium text-sm">
                  ✅ היומן צמוד — אין חורים גדולים
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {gapAnalysis.map((gap, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="bg-white rounded-xl p-4 border border-amber-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-amber-700">
                              {formatTime(gap.gapStart)} — {formatTime(gap.gapEnd)}
                            </span>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              {gap.gapMin} דקות פנויות
                            </span>
                          </div>
                          <p className="text-xs text-muted">
                            אחרי: <span className="font-medium">{gap.afterAppt.profiles?.name}</span>
                            {' · '}
                            לפני: <span className="font-medium">{gap.beforeAppt.profiles?.name}</span>
                          </p>
                          <p className="text-xs text-muted mt-1">
                            הצע ל-<span className="font-medium">{gap.afterAppt.profiles?.name}</span> לעבור לשעה מוקדמת יותר, או ל-<span className="font-medium">{gap.beforeAppt.profiles?.name}</span> להקדים
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <a
                            href={whatsappLink(gap.afterAppt, gap.gapStart)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors text-center whitespace-nowrap"
                          >
                            WhatsApp ← {gap.afterAppt.profiles?.name?.split(' ')[0]}
                          </a>
                          <a
                            href={whatsappLink(gap.beforeAppt, gap.gapStart)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors text-center whitespace-nowrap"
                          >
                            WhatsApp ← {gap.beforeAppt.profiles?.name?.split(' ')[0]}
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

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
              className="inline-block w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 mt-0.5"
              style={{ transform: waitlistEnabled ? 'translateX(2px)' : 'translateX(26px)' }}
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
            <Link to="/admin/appointments" className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>הצג הכל →</Link>
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
