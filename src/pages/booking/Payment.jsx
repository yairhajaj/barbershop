import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useAppointments } from '../../hooks/useAppointments'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { priceDisplay, formatDateFull, formatTime } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

export function Payment() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { settings } = useBusinessSettings()
  const { createAppointment, createRecurringAppointments } = useAppointments()

  const [bookingState] = useState(() =>
    JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
  )

  const [status, setStatus] = useState('idle') // idle | creating | redirecting | paying-at-shop | error
  const [errorMsg, setErrorMsg] = useState('')

  const slotStart = bookingState.slotStart ? new Date(bookingState.slotStart) : null

  // Effective mode was computed in CustomerDetails and stored in booking_state
  const effectiveMode = bookingState.effectivePaymentMode ?? (settings?.payment_enabled ? 'required' : 'disabled')

  useEffect(() => {
    if (!bookingState.slotStart) { navigate('/book/service', { replace: true }); return }
    if (!user) { navigate('/login?redirect=/book/payment', { replace: true }); return }
    // If payment disabled for this booking, skip to confirm
    if (settings && effectiveMode === 'disabled') {
      navigate('/book/confirm', { replace: true })
    }
  }, [user, settings])

  async function handlePay() {
    setStatus('creating')
    try {
      // 1. Create the appointment (pending payment)
      const apptData = {
        customer_id:    user.id,
        service_id:     bookingState.serviceId,
        staff_id:       bookingState.staffId ?? null,
        branch_id:      bookingState.branchId ?? null,
        start_at:       bookingState.slotStart,
        end_at:         bookingState.slotEnd,
        notes:          '',
        status:         'confirmed',
        payment_status: 'pending',
        reminder_opted_in: bookingState.wantsReminder ?? true,
      }

      let appt
      if (bookingState.isRecurring && settings?.recurring_appointments_enabled) {
        const results = await createRecurringAppointments(apptData, settings.recurring_weeks_ahead ?? 12)
        appt = results[0]
      } else {
        appt = await createAppointment(apptData)
      }

      // Save email to profile
      if (bookingState.customerEmail) {
        supabase.from('profiles').update({ email: bookingState.customerEmail }).eq('id', user.id).then(() => {})
      }

      // 2. Get PayPlus payment URL from Edge Function
      setStatus('redirecting')
      const origin = window.location.origin
      const successUrl = `${origin}/book/confirm?payment=success&appt_id=${appt.id}`
      const failureUrl = `${origin}/book/payment?payment=failed&appt_id=${appt.id}`

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          appointment_id: appt.id,
          amount: bookingState.servicePrice ?? 0,
          success_url: successUrl,
          failure_url: failureUrl,
        },
      })

      if (error || !data?.payment_url) {
        throw new Error(data?.error || error?.message || 'שגיאה ביצירת דף תשלום')
      }

      // 3. Clear sessionStorage and redirect to PayPlus
      sessionStorage.removeItem('booking_state')
      window.location.href = data.payment_url

    } catch (err) {
      setErrorMsg(err.message ?? 'שגיאה בביצוע התשלום')
      setStatus('error')
    }
  }

  async function handlePayAtShop() {
    setStatus('paying-at-shop')
    try {
      const apptData = {
        customer_id:    user.id,
        service_id:     bookingState.serviceId,
        staff_id:       bookingState.staffId ?? null,
        branch_id:      bookingState.branchId ?? null,
        start_at:       bookingState.slotStart,
        end_at:         bookingState.slotEnd,
        notes:          '',
        status:         'confirmed',
        payment_status: 'unpaid',
        reminder_opted_in: bookingState.wantsReminder ?? true,
      }

      let appt
      if (bookingState.isRecurring && settings?.recurring_appointments_enabled) {
        const results = await createRecurringAppointments(apptData, settings.recurring_weeks_ahead ?? 12)
        appt = results[0]
      } else {
        appt = await createAppointment(apptData)
      }

      if (bookingState.customerEmail) {
        supabase.from('profiles').update({ email: bookingState.customerEmail }).eq('id', user.id).then(() => {})
      }

      sessionStorage.removeItem('booking_state')
      navigate(`/book/confirm?appt_id=${appt.id}`, { replace: true })
    } catch (err) {
      setErrorMsg(err.message ?? 'שגיאה ביצירת ההזמנה')
      setStatus('error')
    }
  }

  const price = bookingState.servicePrice ?? 0
  const isLoading = status === 'creating' || status === 'redirecting' || status === 'paying-at-shop'
  const isOptional = effectiveMode === 'optional'

  // Payment failed — came back from PayPlus with error
  const urlParams = new URLSearchParams(window.location.search)
  const paymentFailed = urlParams.get('payment') === 'failed'

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-md mx-auto">
        <BookingProgress currentStep="payment" />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            תשלום מאובטח
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            התשלום מתבצע דרך PayPlus — מאובטח ומוצפן
          </p>
        </div>

        <button onClick={() => navigate('/book/details')} className="btn-ghost mb-4 text-sm">
          ← חזרה
        </button>

        {/* Failed banner */}
        {paymentFailed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-4 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}
          >
            ❌ התשלום נכשל או בוטל. ניתן לנסות שוב.
          </motion.div>
        )}

        {/* Booking summary */}
        <div
          className="rounded-2xl p-5 mb-5 space-y-3 text-sm"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <p className="font-bold text-base mb-3" style={{ color: 'var(--color-text)' }}>סיכום הזמנה</p>
          {[
            { label: 'שירות', value: bookingState.serviceName },
            { label: 'ספר',   value: bookingState.staffName },
            { label: 'תאריך', value: slotStart ? formatDateFull(slotStart) : '-' },
            { label: 'שעה',   value: slotStart ? formatTime(slotStart) : '-' },
          ].filter(r => r.value).map(row => (
            <div key={row.label} className="flex justify-between items-center py-1"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-muted)' }}>{row.label}</span>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>{row.value}</span>
            </div>
          ))}
          {/* Price row */}
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold" style={{ color: 'var(--color-text)' }}>סכום לתשלום</span>
            <span className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
              {priceDisplay(price)}
            </span>
          </div>
        </div>

        {/* Security badges */}
        <div className="flex justify-center gap-4 mb-5 text-xs" style={{ color: 'var(--color-muted)' }}>
          <span>🔒 SSL מאובטח</span>
          <span>🛡 PCI DSS</span>
          <span>💳 PayPlus</span>
        </div>

        {status === 'error' && (
          <div className="rounded-2xl p-3 text-sm mb-4"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
            {errorMsg}
          </div>
        )}

        {/* Optional mode hint */}
        {isOptional && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mb-4 text-sm text-center"
            style={{ background: 'rgba(255,133,0,0.06)', border: '1px solid rgba(255,133,0,0.2)', color: 'var(--color-text)' }}
          >
            <p className="font-medium mb-1">🤝 תשלום אופציונלי</p>
            <p style={{ color: 'var(--color-muted)' }}>תוכל לשלם עכשיו אונליין, או לשלם בעסק בסיום הביקור.</p>
          </motion.div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          className="btn-primary w-full justify-center text-base py-4 flex items-center gap-2"
          onClick={handlePay}
          disabled={isLoading}
        >
          {isLoading && status !== 'paying-at-shop' ? (
            <>
              <Spinner size="sm" className="border-white border-t-transparent" />
              {status === 'creating' ? 'יוצר הזמנה...' : 'מעביר לתשלום...'}
            </>
          ) : (
            <>💳 {isOptional ? 'שלם עכשיו' : `שלם`} {priceDisplay(price)}</>
          )}
        </motion.button>

        {isOptional && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn-outline w-full justify-center text-base py-4 flex items-center gap-2 mt-3"
            onClick={handlePayAtShop}
            disabled={isLoading}
          >
            {status === 'paying-at-shop' ? (
              <>
                <Spinner size="sm" />
                יוצר הזמנה...
              </>
            ) : (
              <>🏪 לשלם בעסק</>
            )}
          </motion.button>
        )}

        <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted)' }}>
          {isOptional ? 'ניתן לבטל עד 24 שעות לפני התור' : 'לאחר התשלום תועבר חזרה לאישור ההזמנה'}
        </p>
      </div>
    </div>
  )
}
