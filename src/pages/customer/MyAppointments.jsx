import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, startOfDay, isSameDay, addMinutes, isToday, isBefore } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useStaff } from '../../hooks/useStaff'
import { useReviews } from '../../hooks/useReviews'
import { StatusBadge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../contexts/ThemeContext'
import {
  formatDateFull, formatTime, priceDisplay,
  isWithinCancellationWindow, generateSlots, dayName,
} from '../../lib/utils'

const DAYS_AHEAD = 30

export function MyAppointments() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { isDark } = useTheme()
  const { settings, hours } = useBusinessSettings()
  const { staff } = useStaff({ activeOnly: true })

  const { appointments, loading, cancelAppointment, cancelRecurringGroup, rescheduleAppointment, refetch } = useAppointments({
    customerId: user?.id
  })

  const { submitReview } = useReviews()
  const [showHistory, setShowHistory] = useState(false)
  const [rescheduleAppt, setRescheduleAppt]     = useState(null)
  const [rescheduleDate, setRescheduleDate]     = useState(startOfDay(new Date()))
  const [rescheduleSlots, setRescheduleSlots]   = useState([])
  const [rescheduleAppts, setRescheduleAppts]   = useState([])
  const [rescheduleBlocked, setRescheduleBlocked] = useState([])
  const [rescheduling, setRescheduling]         = useState(false)
  const [slotsLoading, setSlotsLoading]         = useState(false)
  const [reviewAppt, setReviewAppt]             = useState(null)
  const [reviewRating, setReviewRating]         = useState(5)
  const [reviewComment, setReviewComment]       = useState('')
  const [reviewSaving, setReviewSaving]         = useState(false)
  // track which appointments already have a review (appointment_id set)
  const [reviewedIds, setReviewedIds]           = useState(new Set())

  // Waitlist entries
  const [waitlistEntries, setWaitlistEntries]   = useState([])
  const [waitlistLoading, setWaitlistLoading]   = useState(false)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?redirect=/my-appointments', { replace: true })
  }, [user, authLoading])

  useEffect(() => {
    if (user) loadWaitlist()
  }, [user])

  async function loadWaitlist() {
    if (!user) return
    setWaitlistLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('*, services(name)')
      .eq('customer_id', user.id)
      .in('status', ['pending', 'notified'])
      .order('preferred_date', { ascending: true })
    setWaitlistEntries(data ?? [])
    setWaitlistLoading(false)
  }

  async function handleRemoveWaitlist(id) {
    await supabase.from('waitlist').update({ status: 'removed' }).eq('id', id)
    setWaitlistEntries(prev => prev.filter(e => e.id !== id))
  }

  useEffect(() => {
    if (rescheduleAppt) loadRescheduleData()
  }, [rescheduleDate, rescheduleAppt])

  async function loadRescheduleData() {
    if (!rescheduleAppt) return
    setSlotsLoading(true)
    const start = new Date(rescheduleDate); start.setHours(0,0,0,0)
    const end   = new Date(rescheduleDate); end.setHours(23,59,59,999)

    const [{ data: appts }, { data: blocked }] = await Promise.all([
      supabase.from('appointments')
        .select('*')
        .eq('staff_id', rescheduleAppt.staff_id)
        .in('status', ['confirmed', 'pending_reschedule'])
        .neq('id', rescheduleAppt.id)
        .gte('start_at', start.toISOString())
        .lte('start_at', end.toISOString()),
      supabase.from('blocked_times')
        .select('*')
        .eq('staff_id', rescheduleAppt.staff_id)
        .lte('start_at', end.toISOString())
        .gte('end_at', start.toISOString()),
    ])
    setRescheduleAppts(appts ?? [])
    setRescheduleBlocked(blocked ?? [])
    setSlotsLoading(false)
  }

  useEffect(() => {
    if (!rescheduleAppt || !staff.length) return
    const dow = rescheduleDate.getDay()
    const businessDay = hours.find(h => h.day_of_week === dow)
    const member = staff.find(s => s.id === rescheduleAppt.staff_id)
    if (!member) return

    const staffDay = member.staff_hours?.find(h => h.day_of_week === dow)
    const duration = rescheduleAppt.services?.duration_minutes ?? 30
    const slots = generateSlots({
      date: rescheduleDate,
      durationMinutes: duration,
      staffHours: staffDay,
      businessHours: businessDay,
      existingAppointments: rescheduleAppts,
      blockedTimes: rescheduleBlocked,
    })
    const now = new Date()
    setRescheduleSlots(
      slots.filter(s => isToday(rescheduleDate) ? !isBefore(s.start, addMinutes(now, 30)) : true)
    )
  }, [rescheduleDate, rescheduleAppts, rescheduleBlocked, staff, hours])

  async function handleCancel(appt) {
    const canCancel = isWithinCancellationWindow(appt.start_at, settings.cancellation_hours)
    if (!canCancel) {
      toast({ message: `לא ניתן לבטל פחות מ-${settings.cancellation_hours} שעות לפני התור. צור קשר ישירות.`, type: 'error' })
      return
    }
    if (!confirm('האם לבטל את התור?')) return
    try {
      await cancelAppointment(appt.id, '', 'customer')
      toast({ message: 'התור בוטל', type: 'success' })
    } catch {
      toast({ message: 'שגיאה בביטול', type: 'error' })
    }
  }

  async function handleCancelRecurring(appt) {
    const canCancel = isWithinCancellationWindow(appt.start_at, settings.cancellation_hours)
    if (!canCancel) {
      toast({ message: `לא ניתן לבטל פחות מ-${settings.cancellation_hours} שעות לפני התור.`, type: 'error' })
      return
    }
    const choice = window.confirm('לבטל את כל התורים הקבועים העתידיים?\n\nלחץ אישור לביטול הכל, או ביטול לביטול תור זה בלבד.')
    try {
      if (choice) {
        await cancelRecurringGroup(appt.recurring_group_id, 'customer')
        toast({ message: 'כל התורים הקבועים בוטלו', type: 'success' })
      } else {
        await cancelAppointment(appt.id, '', 'customer')
        toast({ message: 'התור בוטל', type: 'success' })
      }
    } catch {
      toast({ message: 'שגיאה בביטול', type: 'error' })
    }
  }

  async function handleReschedule(slot) {
    setRescheduling(true)
    try {
      await rescheduleAppointment(rescheduleAppt.id, slot.start.toISOString(), slot.end.toISOString())
      toast({ message: 'התור הועבר בהצלחה', type: 'success' })
      setRescheduleAppt(null)
      refetch()
    } catch {
      toast({ message: 'שגיאה בשינוי התור', type: 'error' })
    } finally {
      setRescheduling(false)
    }
  }

  // Load which appointment IDs already have reviews
  useEffect(() => {
    if (!user || appointments.length === 0) return
    const completedIds = appointments.filter(a => a.status === 'completed').map(a => a.id)
    if (completedIds.length === 0) return
    supabase.from('reviews').select('appointment_id').in('appointment_id', completedIds)
      .then(({ data }) => {
        if (data) setReviewedIds(new Set(data.map(r => r.appointment_id)))
      })
  }, [user, appointments])

  async function handleSubmitReview() {
    if (!reviewAppt) return
    setReviewSaving(true)
    try {
      await submitReview({
        appointmentId: reviewAppt.id,
        customerId: user.id,
        staffId: reviewAppt.staff_id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      })
      setReviewedIds(prev => new Set([...prev, reviewAppt.id]))
      toast({ message: 'תודה על הביקורת! ✨', type: 'success' })
      setReviewAppt(null)
      setReviewComment('')
      setReviewRating(5)
    } catch {
      toast({ message: 'שגיאה בשמירת הביקורת', type: 'error' })
    } finally {
      setReviewSaving(false)
    }
  }

  const upcoming = appointments
    .filter(a => a.status === 'confirmed' && new Date(a.start_at) > new Date())
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  const past = appointments
    .filter(a => a.status === 'completed' || a.status === 'cancelled' || (a.status !== 'confirmed' && new Date(a.start_at) <= new Date()))
    .sort((a, b) => new Date(b.start_at) - new Date(a.start_at))

  // Date options for reschedule picker
  const dateOptions = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = startOfDay(addDays(new Date(), i))
    const dow = d.getDay()
    const bh = hours.find(h => h.day_of_week === dow)
    if (!bh?.is_closed) dateOptions.push(d)
  }

  if (authLoading || loading) return (
    <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
      <Spinner size="lg" />
    </div>
  )

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl font-black mb-6" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
          התורים שלי
        </h1>

        {/* Upcoming */}
        <section className="mb-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-muted)' }}>תורים קרובים</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-4xl mb-3">📅</div>
              <p className="font-bold" style={{ color: 'var(--color-text)' }}>אין תורים קרובים</p>
              <Link to="/book/service" className="btn-primary mt-4 text-sm inline-flex">קבע תור עכשיו</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((appt, i) => (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>{appt.services?.name}</h3>
                        {appt.is_recurring && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{ background: 'rgba(255,122,0,0.1)', color: 'var(--color-gold)' }}
                          >
                            🔁 קבוע
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>{appt.staff?.name}</p>
                    </div>
                    <StatusBadge status={appt.status} />
                  </div>
                  <div className="text-sm mb-4 space-y-1" style={{ color: 'var(--color-muted)' }}>
                    <div>📅 {formatDateFull(new Date(appt.start_at))}</div>
                    <div>🕐 {formatTime(new Date(appt.start_at))}</div>
                    {appt.services?.price && (
                      <div style={{ color: 'var(--color-gold)', fontWeight: 700 }}>
                        ₪ {priceDisplay(appt.services.price)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4">
                    {isWithinCancellationWindow(appt.start_at, settings.cancellation_hours) && (
                      <>
                        <button
                          onClick={() => { setRescheduleAppt(appt); setRescheduleDate(startOfDay(new Date())) }}
                          className="text-sm font-bold hover:underline"
                          style={{ color: 'var(--color-gold)' }}
                        >
                          ✏ שנה מועד
                        </button>
                        <button
                          onClick={() => appt.is_recurring ? handleCancelRecurring(appt) : handleCancel(appt)}
                          className="text-sm font-bold text-red-500 hover:underline"
                        >
                          ✕ בטל{appt.is_recurring ? ' (קבוע)' : ''}
                        </button>
                      </>
                    )}
                    {!isWithinCancellationWindow(appt.start_at, settings.cancellation_hours) && (
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>לשינוי או ביטול צור קשר ישירות</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Waitlist */}
        {(waitlistLoading || waitlistEntries.length > 0) && (
          <section className="mb-8">
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-muted)' }}>📋 רשימת המתנה</h2>
            {waitlistLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : (
              <div className="flex flex-col gap-3">
                {waitlistEntries.map((entry, i) => {
                  const statusLabel = entry.status === 'notified' ? 'הופנה' : 'ממתין'
                  const statusColor = entry.status === 'notified' ? '#3B82F6' : 'var(--color-gold)'
                  const statusBg    = entry.status === 'notified' ? 'rgba(59,130,246,0.1)' : 'rgba(255,122,0,0.1)'
                  // Format date dd.MM.yyyy
                  const [y, m, d] = entry.preferred_date.split('-')
                  const dateDisplay = `${d}.${m}.${y}`

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-2xl p-4"
                      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                              {entry.services?.name ?? 'כל שירות'}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: statusBg, color: statusColor }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="text-xs space-y-0.5" style={{ color: 'var(--color-muted)' }}>
                            <div>📅 {dateDisplay}</div>
                            <div>🕐 {entry.time_from?.slice(0,5)} – {entry.time_to?.slice(0,5)}</div>
                          </div>
                          {entry.status === 'notified' && (
                            <p className="text-xs mt-1.5 font-medium" style={{ color: '#3B82F6' }}>
                              💬 נשלחה הצעת תור — בדוק את ההודעות שלך
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveWaitlist(entry.id)}
                          className="text-xs px-2.5 py-1 rounded-full flex-shrink-0 mr-3 transition-all"
                          style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
                          title="הסר מהרשימה"
                        >
                          ✕ הסר
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Past */}
        <section>
          {!showHistory || past.length === 0 ? (
            <button
              onClick={() => setShowHistory(true)}
              className="w-full text-center text-sm font-bold py-3 rounded-2xl transition-all"
              style={{
                background: 'var(--color-card)',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              {past.length > 0
                ? `לצפייה בהיסטוריית התורים (${past.length})`
                : 'לצפייה בהיסטוריית התורים'}
            </button>
          ) : (
            <>
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-muted)' }}>היסטוריה</h2>
            <div className="flex flex-col gap-2.5">
              {past.map((appt, i) => (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-2xl p-4 opacity-70"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{appt.services?.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{formatDateFull(new Date(appt.start_at))}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {appt.status === 'completed' && (
                        reviewedIds.has(appt.id) ? (
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>✓ דירגת</span>
                        ) : (
                          <button
                            onClick={() => { setReviewAppt(appt); setReviewRating(5); setReviewComment('') }}
                            className="text-xs font-bold px-2.5 py-1 rounded-full transition-all"
                            style={{ background: 'rgba(255,122,0,0.12)', color: 'var(--color-gold)' }}
                          >
                            ⭐ דרג
                          </button>
                        )
                      )}
                      <StatusBadge status={appt.status} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            </>
          )}
        </section>
      </div>

      {/* Review modal */}
      <AnimatePresence>
        {reviewAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={e => e.target === e.currentTarget && setReviewAppt(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="rounded-3xl w-full max-w-md"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            >
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <h2 className="font-black text-lg" style={{ color: 'var(--color-text)' }}>דרג את הביקור</h2>
                <button onClick={() => setReviewAppt(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-xl"
                  style={{ color: 'var(--color-muted)', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>×</button>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>{reviewAppt.services?.name} · {reviewAppt.staff?.name}</p>
                </div>
                {/* Star rating */}
                <div>
                  <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-muted)' }}>דירוג</p>
                  <div className="flex gap-2 justify-center">
                    {[1,2,3,4,5].map(star => (
                      <button
                        key={star}
                        onClick={() => setReviewRating(star)}
                        className="text-3xl transition-transform hover:scale-110"
                        style={{ color: star <= reviewRating ? '#FBBF24' : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', filter: star <= reviewRating ? 'none' : 'grayscale(1)' }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                {/* Comment */}
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>הערה (אופציונלי)</p>
                  <textarea
                    className="input w-full resize-none"
                    rows={3}
                    placeholder="ספר לנו על החוויה שלך..."
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    maxLength={300}
                  />
                </div>
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewSaving}
                  className="btn-primary w-full justify-center py-3 text-sm"
                >
                  {reviewSaving ? 'שומר...' : 'שלח ביקורת ✨'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reschedule modal */}
      <AnimatePresence>
        {rescheduleAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={e => e.target === e.currentTarget && setRescheduleAppt(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
            >
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <h2 className="font-black text-lg" style={{ color: 'var(--color-text)' }}>שנה מועד</h2>
                <button onClick={() => setRescheduleAppt(null)} className="text-2xl w-8 h-8 flex items-center justify-center rounded-full"
                  style={{ color: 'var(--color-muted)', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>×</button>
              </div>

              <div className="p-5">
                <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
                  {rescheduleAppt.services?.name} · {rescheduleAppt.staff?.name}
                </p>

                {/* Date picker */}
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>בחר יום</p>
                <div className="overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
                  <div className="flex gap-2 min-w-max">
                    {dateOptions.map(d => {
                      const active = isSameDay(d, rescheduleDate)
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => setRescheduleDate(d)}
                          className="flex flex-col items-center px-3 py-2 rounded-2xl text-xs font-semibold transition-all min-w-[50px] border-2"
                          style={{
                            background:   active ? 'var(--color-gold)'   : 'var(--color-surface)',
                            borderColor:  active ? 'var(--color-gold)'   : 'var(--color-border)',
                            color:        active ? '#fff'                : 'var(--color-text)',
                          }}
                        >
                          <span style={{ opacity: active ? 1 : 0.6 }}>{dayName(d.getDay())}</span>
                          <span className="text-base font-black">{d.getDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-muted)' }}>בחר שעה</p>
                {/* Slots */}
                {slotsLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-center py-8 text-sm" style={{ color: 'var(--color-muted)' }}>אין שעות פנויות ביום זה</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {rescheduleSlots.map(slot => (
                      <button
                        key={slot.start.toISOString()}
                        onClick={() => handleReschedule(slot)}
                        disabled={rescheduling}
                        className="py-3 rounded-2xl border-2 transition-all text-sm font-bold"
                        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--color-gold)'
                          e.currentTarget.style.borderColor = 'var(--color-gold)'
                          e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'var(--color-surface)'
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                          e.currentTarget.style.color = 'var(--color-text)'
                        }}
                      >
                        {formatTime(slot.start)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
