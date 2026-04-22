import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { formatDateFull, formatTime, priceDisplay } from '../../lib/utils'
import { BUSINESS } from '../../config/business'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'

export function Confirmation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()

  // Payment redirect params
  const paymentResult      = searchParams.get('payment')          // 'success' | null
  const paymentApptId      = searchParams.get('appt_id')          // appointment id from Grow redirect
  const paymentId          = searchParams.get('payment_id')
  const growTransactionCode = searchParams.get('transactionCode') // Grow appends this on success

  // Read booking state ONCE at mount — never re-read (so sessionStorage.removeItem doesn't break display)
  const [bookingState] = useState(() =>
    JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
  )

  const { createAppointment, createRecurringAppointments } = useAppointments()
  const { settings } = useBusinessSettings()
  const { isDark } = useTheme()

  const { isSupported: pushSupported, requestPermission: requestPush } = usePushNotifications()

  const [status, setStatus]           = useState('idle')
  const [appointment, setAppointment] = useState(null)
  const [errorMsg, setErrorMsg]       = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [pushBanner, setPushBanner]   = useState(false)
  const [wantsReminder, setWantsReminder] = useState(true)

  useEffect(() => {
    // If coming back from successful Grow payment — verify and show success automatically
    if (paymentResult === 'success' && paymentId && paymentApptId) {
      setStatus('loading')
      supabase.functions.invoke('verify-payment', {
        body: { payment_id: paymentId, transaction_code: growTransactionCode ?? undefined },
      })
        .then(({ data }) => {
          if (data?.paid) {
            // Fetch the appointment to display
            return supabase.from('appointments')
              .select('*, services(name, price), staff(name)')
              .eq('id', paymentApptId)
              .single()
          }
          throw new Error('התשלום לא אומת')
        })
        .then(({ data: appt }) => {
          setAppointment(appt)
          setStatus('success')
        })
        .catch(err => {
          setErrorMsg(err.message)
          setStatus('error')
        })
      return
    }
    if (authLoading) return
    if (!bookingState.slotStart && !paymentResult) { navigate('/book/service', { replace: true }); return }
    if (!user) navigate('/login?redirect=/book/confirm', { replace: true })
  }, [user, authLoading])

  const slotStart = bookingState.slotStart ? new Date(bookingState.slotStart) : null
  const slotEnd   = bookingState.slotEnd   ? new Date(bookingState.slotEnd)   : null

  async function confirmBooking() {
    setStatus('loading')
    try {
      const groupSize = bookingState.groupSize ?? 1
      const duration  = bookingState.serviceDuration ?? 30

      // ── Conflict check (client-side guard against double booking) ────────────
      // Compute the full time range we're about to occupy
      const rangeStart = bookingState.slotStart
      const rangeEnd   = groupSize > 1
        ? (bookingState.slotGroupEnd ?? new Date(new Date(bookingState.slotStart).getTime() + groupSize * duration * 60_000).toISOString())
        : bookingState.slotEnd

      if (bookingState.staffId && rangeStart && rangeEnd) {
        // 1. Check if the staff slot is already taken by anyone
        const { data: staffConflicts } = await supabase
          .from('appointments')
          .select('id')
          .eq('staff_id', bookingState.staffId)
          .neq('status', 'cancelled')
          .lt('start_at', rangeEnd)    // existing starts before new range ends
          .gt('end_at',   rangeStart)  // existing ends   after  new range starts
          .limit(1)

        if (staffConflicts?.length > 0) {
          setErrorMsg('השעה שבחרת כבר תפוסה — אנא חזור ובחר שעה אחרת.')
          setStatus('error')
          return
        }

        // 2. Check if this customer already has an overlapping appointment
        const { data: selfConflicts } = await supabase
          .from('appointments')
          .select('id')
          .eq('customer_id', user.id)
          .neq('status', 'cancelled')
          .lt('start_at', rangeEnd)
          .gt('end_at',   rangeStart)
          .limit(1)

        if (selfConflicts?.length > 0) {
          setErrorMsg('כבר יש לך תור בשעה זו — בדוק את התורים שלך.')
          setStatus('error')
          return
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const baseData = {
        customer_id:       user.id,
        service_id:        bookingState.serviceId,
        staff_id:          bookingState.staffId ?? null,
        branch_id:         bookingState.branchId ?? null,
        notes:             '',
        status:            'confirmed',
        reminder_opted_in: wantsReminder,
      }

      let appt
      if (groupSize > 1) {
        // Create N consecutive appointments
        const rows = Array.from({ length: groupSize }, (_, i) => {
          const start = new Date(new Date(bookingState.slotStart).getTime() + i * duration * 60_000)
          const end   = new Date(start.getTime() + duration * 60_000)
          return {
            ...baseData,
            start_at: start.toISOString(),
            end_at:   end.toISOString(),
            notes:    i === 0 ? `קבוצה של ${groupSize}` : `קבוצה של ${groupSize} · אדם ${i + 1}`,
          }
        })
        const { data, error } = await supabase.from('appointments').insert(rows).select()
        if (error) throw error
        appt = data[0]
      } else {
        const apptData = { ...baseData, start_at: bookingState.slotStart, end_at: bookingState.slotEnd }
        if (isRecurring && settings.recurring_appointments_enabled) {
          const results = await createRecurringAppointments(apptData, settings.recurring_weeks_ahead ?? 12)
          appt = results[0]
        } else {
          appt = await createAppointment(apptData)
        }
      }

      // Save email to profile for customer management
      if (user && bookingState.customerEmail) {
        supabase
          .from('profiles')
          .update({ email: bookingState.customerEmail })
          .eq('id', user.id)
          .then(() => {}) // fire-and-forget
      }

      sessionStorage.removeItem('booking_state')
      setAppointment(appt)
      setStatus('success')
      // Show push permission banner — web only, never on native iOS
      try {
        const isNativeApp = !!(window?.Capacitor?.isNativePlatform?.())
        const notifPermission = !isNativeApp && typeof Notification !== 'undefined'
          ? Notification.permission : 'denied'
        if (!isNativeApp && pushSupported && import.meta.env.VITE_VAPID_PUBLIC_KEY &&
            notifPermission === 'default') {
          setPushBanner(true)
        }
      } catch { /* ignore on iOS native */ }
    } catch (err) {
      setErrorMsg(err.message ?? 'שגיאה בקביעת התור')
      setStatus('error')
    }
  }

  function googleCalendarLink() {
    if (!slotStart || !slotEnd) return '#'
    const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const text    = encodeURIComponent(`${bookingState.serviceName} — ${BUSINESS.name}`)
    const details = encodeURIComponent(`ספר: ${bookingState.staffName}\nטלפון: ${BUSINESS.phone}`)
    const loc     = encodeURIComponent(BUSINESS.address)
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(slotStart)}/${fmt(slotEnd)}&details=${details}&location=${loc}`
  }

  function downloadICS() {
    if (!slotStart || !slotEnd) return
    const fmt = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(slotStart)}`,
      `DTEND:${fmt(slotEnd)}`,
      `SUMMARY:${bookingState.serviceName} — ${BUSINESS.name}`,
      `DESCRIPTION:ספר: ${bookingState.staffName}\\nטלפון: ${BUSINESS.phone}`,
      `LOCATION:${BUSINESS.address}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'tor.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  function cancellationPolicyText() {
    const hours   = settings.cancellation_hours ?? 24
    const feeType = settings.cancellation_fee_type ?? 'none'
    const fee     = settings.cancellation_fee

    let noShowText = 'אי הגעה ללא ביטול לא תחויב בנוסף.'
    if (feeType === 'full') {
      noShowText = 'אי הגעה ללא ביטול תחויב במחיר מלא של השירות.'
    } else if (feeType === 'percentage' && fee) {
      noShowText = `אי הגעה ללא ביטול תחויב ב-${fee}% ממחיר השירות.`
    } else if (feeType === 'fixed' && fee) {
      noShowText = `אי הגעה ללא ביטול תחויב ב-₪${fee}.`
    }

    return `ניתן לבטל עד ${hours} שעות לפני התור. ${noShowText}`
  }

  // ── SUCCESS ───────────────────────────────────────────────────────
  if (status === 'success' && appointment) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full mx-4 p-8 text-center rounded-3xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--color-gold)' }}
          >
            <span className="text-white text-3xl font-black">✓</span>
          </motion.div>

          <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            {(bookingState.groupSize ?? 1) > 1
              ? `${bookingState.groupSize} תורים נקבעו!`
              : 'התור נקבע בהצלחה!'}
          </h1>

          {(bookingState.groupSize ?? 1) > 1 && (
            <div
              className="my-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(255,122,0,0.1)', color: 'var(--color-gold)' }}
            >
              👥 {bookingState.groupSize} תורים צמודים · {bookingState.groupSize * (bookingState.serviceDuration ?? 30)} דקות
            </div>
          )}

          {isRecurring && (
            <div
              className="my-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(255,122,0,0.1)', color: 'var(--color-gold)' }}
            >
              🔁 תור קבוע שבועי — {settings.recurring_weeks_ahead ?? 12} שבועות
            </div>
          )}

          <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
            {(bookingState.groupSize ?? 1) > 1
              ? `${formatDateFull(slotStart)} · ${formatTime(slotStart)} – ${formatTime(new Date(bookingState.slotGroupEnd ?? bookingState.slotEnd))}`
              : `נתראה ב${slotStart ? formatDateFull(slotStart) : ''} בשעה ${slotStart ? formatTime(slotStart) : ''}`}
          </p>

          {/* Summary */}
          <div
            className="rounded-2xl p-4 text-right mb-5 space-y-2.5 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {[
              { label: 'סניף',  value: bookingState.branchName },
              { label: 'שירות', value: bookingState.serviceName },
              { label: 'ספר',   value: bookingState.staffName },
              { label: 'תאריך', value: slotStart ? formatDateFull(slotStart) : '' },
              { label: 'שעה',   value: slotStart ? formatTime(slotStart) : '' },
              { label: 'מחיר',  value: priceDisplay(bookingState.servicePrice), accent: true },
            ].filter(r => r.value).map(row => (
              <div key={row.label} className="flex justify-between items-center">
                <span style={{ color: 'var(--color-muted)' }}>{row.label}</span>
                <span className="font-bold" style={{ color: row.accent ? 'var(--color-gold)' : 'var(--color-text)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Push permission banner */}
          {pushBanner && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 mb-2 text-right"
              style={{ background: 'rgba(201,169,110,0.1)', border: '1.5px solid rgba(201,169,110,0.3)' }}
            >
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)' }}>🔔 קבל תזכורות על התורים שלך</p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>אפשר התראות ותקבל עדכונים ומבצעים ישירות לנייד</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const res = await requestPush()
                    setPushBanner(false)
                    if (res.ok) alert('✓ התראות הופעלו!')
                  }}
                  className="btn-primary text-sm py-2 px-4"
                >
                  אפשר התראות
                </button>
                <button onClick={() => setPushBanner(false)} className="btn-ghost text-sm py-2 px-3">
                  לא עכשיו
                </button>
              </div>
            </motion.div>
          )}

          <div className="flex flex-col gap-2.5">
            <button onClick={downloadICS} className="btn-primary justify-center text-sm py-3">
              📅 הוסף תזכורת ביומן
            </button>
            <a href={googleCalendarLink()} target="_blank" rel="noopener noreferrer"
              className="btn-outline justify-center text-sm py-3">
              Google Calendar
            </a>
            <Link to="/my-appointments"
              className="text-sm font-medium text-center py-2"
              style={{ color: 'var(--color-muted)' }}>
              הצג את התורים שלי ←
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── CONFIRM SCREEN ────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh', background: 'var(--color-surface)' }}>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pt-20 pb-2">
        <div className="container px-4 sm:px-6 max-w-md mx-auto">
          <BookingProgress currentStep="confirm" />

          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              אישור {(bookingState.groupSize ?? 1) > 1 ? 'הזמנה קבוצתית' : 'התור'}
            </h1>
            {(bookingState.groupSize ?? 1) > 1 && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(255,122,0,0.10)', color: 'var(--color-gold)', border: '1px solid rgba(255,122,0,0.2)' }}>
                👥 {bookingState.groupSize}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="rounded-2xl p-3 mb-2 text-sm"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            {[
              { label: 'סניף',  value: bookingState.branchName },
              { label: 'שירות', value: bookingState.serviceName },
              { label: 'ספר',   value: bookingState.staffName },
              { label: 'תאריך', value: slotStart ? formatDateFull(slotStart) : '-' },
              { label: 'שעה',   value: slotStart ? formatTime(slotStart) : '-' },
              { label: 'מחיר',  value: priceDisplay(bookingState.servicePrice), accent: true },
            ].filter(r => r.value).map((row, idx, arr) => (
              <div key={row.label} className="flex justify-between items-center py-1.5"
                style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{row.label}</span>
                <span className="font-bold text-sm" style={{ color: row.accent ? 'var(--color-gold)' : 'var(--color-text)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Customer info + policy — one compact row each */}
          {profile && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 text-xs"
              style={{ background: 'rgba(255,122,0,0.06)', border: '1px solid rgba(255,122,0,0.15)' }}>
              <span style={{ color: 'var(--color-gold)' }}>👤</span>
              <span style={{ color: 'var(--color-muted)' }}>{profile.name} · {profile.phone}</span>
            </div>
          )}

          <p className="text-xs px-1 mb-2" style={{ color: 'var(--color-muted)', lineHeight: 1.4 }}>
            {cancellationPolicyText()}
          </p>

          {/* Toggles — compact */}
          {settings.recurring_appointments_enabled && (
            <label className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 mb-2"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              <div className="relative flex-shrink-0">
                <input type="checkbox" className="sr-only" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
                <div className="w-10 h-5 rounded-full transition-all duration-200"
                  style={{ background: isRecurring ? 'var(--color-gold)' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ right: isRecurring ? '2px' : 'calc(100% - 18px)' }} />
                </div>
              </div>
              <div>
                <p className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>🔁 תור קבוע שבועי</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>כל שבוע · {settings.recurring_weeks_ahead ?? 12} שבועות</p>
              </div>
            </label>
          )}

          <label className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 mb-2"
            style={{ background: 'var(--color-card)', border: `1.5px solid ${wantsReminder ? 'var(--color-gold)' : 'var(--color-border)'}` }}>
            <div className="relative flex-shrink-0" onClick={() => setWantsReminder(r => !r)}>
              <div className="w-10 h-5 rounded-full transition-all duration-200"
                style={{ background: wantsReminder ? 'var(--color-gold)' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                  style={{ right: wantsReminder ? '2px' : 'calc(100% - 18px)' }} />
              </div>
            </div>
            <div>
              <p className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>🔔 תזכורת לפני התור</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>WhatsApp / Push</p>
            </div>
          </label>

          {status === 'error' && (
            <div className="rounded-xl p-3 text-xs mb-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
              {errorMsg}
            </div>
          )}
        </div>
      </div>

      {/* Sticky confirm button */}
      <div className="px-4 pt-2 pb-4" style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div className="max-w-md mx-auto">
          <button
            className="btn-primary w-full justify-center text-base py-3"
            onClick={confirmBooking}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <><Spinner size="sm" className="border-white border-t-transparent" /> מאשר...</>
            ) : (bookingState.groupSize ?? 1) > 1 ? (
              `✓ אשר ${bookingState.groupSize} תורים צמודים`
            ) : isRecurring ? (
              `🔁 אשר ${settings.recurring_weeks_ahead ?? 12} תורים שבועיים`
            ) : (
              '✓ אשר הזמנה'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
