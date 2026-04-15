import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { formatDateFull, formatTime } from '../../lib/utils'

export function CustomerDetails() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { settings } = useBusinessSettings()
  const bookingState = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')

  const [form, setForm] = useState({
    name:  profile?.name  ?? '',
    phone: profile?.phone ?? '',
    email: user?.email    ?? '',
    notes: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!bookingState.slotStart) navigate('/book/datetime', { replace: true })
  }, [])

  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        name:  f.name  || profile.name  || '',
        phone: f.phone || profile.phone || '',
        email: f.email || user?.email   || '',
      }))
    }
  }, [profile, user])

  function validate() {
    const e = {}
    if (!form.name.trim())  e.name  = 'שם נדרש'
    if (!form.phone.trim()) e.phone = 'טלפון נדרש'
    if (!form.email.trim()) e.email = 'אימייל נדרש'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'אימייל לא תקין'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    if (!user) {
      sessionStorage.setItem('booking_state', JSON.stringify({
        ...bookingState,
        customerName:  form.name,
        customerPhone: form.phone,
        customerEmail: form.email,
        customerNotes: form.notes,
      }))
      navigate('/register?redirect=/book/confirm')
      return
    }

    // Determine effective payment mode: service > branch > global
    const svcMode = bookingState.servicePaymentMode
    const branchMode = bookingState.branchPaymentMode
    const globalMode = settings?.payment_mode ?? 'required'
    let effectiveMode = 'disabled'
    if (settings?.payment_enabled) {
      if (svcMode && svcMode !== 'inherit') effectiveMode = svcMode
      else if (branchMode && branchMode !== 'inherit') effectiveMode = branchMode
      else effectiveMode = globalMode === 'per_service' ? 'optional' : globalMode
    }

    sessionStorage.setItem('booking_state', JSON.stringify({
      ...bookingState,
      customerName:   form.name,
      customerPhone:  form.phone,
      customerEmail:  form.email,
      customerNotes:  form.notes,
      paymentEnabled: effectiveMode !== 'disabled',
      effectivePaymentMode: effectiveMode,
    }))
    // Navigate to payment page unless payment is disabled for this booking
    const nextStep = effectiveMode !== 'disabled' ? '/book/payment' : '/book/confirm'
    navigate(nextStep)
  }

  const slotStart = bookingState.slotStart ? new Date(bookingState.slotStart) : null

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep="confirm" />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            הפרטים שלך
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>שלב אחרון לפני אישור התור</p>
        </div>

        <button onClick={() => navigate('/book/datetime')} className="btn-ghost mb-4 text-sm">
          ← חזרה
        </button>

        {/* Booking Summary */}
        {slotStart && (
          <div
            className="p-4 mb-5 rounded-2xl border-r-4"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRightColor: 'var(--color-gold)',
              borderRightWidth: '4px',
            }}
          >
            <h3 className="font-bold mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
              סיכום התור
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span style={{ color: 'var(--color-muted)' }}>שירות: </span><span className="font-bold">{bookingState.serviceName}</span></div>
              <div><span style={{ color: 'var(--color-muted)' }}>ספר: </span><span className="font-bold">{bookingState.staffName}</span></div>
              <div><span style={{ color: 'var(--color-muted)' }}>תאריך: </span><span className="font-bold">{formatDateFull(slotStart)}</span></div>
              <div><span style={{ color: 'var(--color-muted)' }}>שעה: </span><span className="font-bold">{formatTime(slotStart)}</span></div>
            </div>
          </div>
        )}

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          {!user && (
            <div
              className="rounded-xl p-3 text-sm flex items-center justify-between"
              style={{ background: 'rgba(255,122,0,0.08)', border: '1px solid rgba(255,122,0,0.2)' }}
            >
              <span style={{ color: 'var(--color-text)' }}>כבר יש לך חשבון?</span>
              <Link to="/login?redirect=/book/details" className="font-bold hover:underline" style={{ color: 'var(--color-gold)' }}>כניסה</Link>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>שם מלא *</label>
            <input
              className={`input ${errors.name ? 'border-red-400' : ''}`}
              placeholder="ישראל ישראלי"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>טלפון *</label>
            <input
              className={`input ${errors.phone ? 'border-red-400' : ''}`}
              placeholder="050-0000000"
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>אימייל *</label>
            <input
              className={`input ${errors.email ? 'border-red-400' : ''}`}
              placeholder="name@email.com"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>הערות (אופציונלי)</label>
            <textarea
              className="input resize-none h-20"
              placeholder="בקשות מיוחדות, העדפות..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn-primary justify-center mt-2 text-base py-4">
            המשך לאישור →
          </button>
        </motion.form>
      </div>
    </div>
  )
}
