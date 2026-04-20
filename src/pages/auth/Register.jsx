import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'

const GENDERS = [
  { value: 'male',   label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other',  label: 'אחר' },
]

export function Register() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', phone: '', birthDate: '', gender: '', termsAccepted: false,
  })
  const [code, setCode]             = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [loading, setLoading]       = useState(false)

  const { sendOtp, verifyOtpAndLogin } = useAuth()
  const navigate                       = useNavigate()
  const [searchParams]                 = useSearchParams()
  const toast                          = useToast()
  const redirect                       = searchParams.get('redirect') ?? '/'

  async function handleStep1(e) {
    e.preventDefault()
    const cleanPhone = form.phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 9) { toast({ message: 'מספר טלפון לא תקין', type: 'error' }); return }
    if (!form.termsAccepted) { toast({ message: 'יש לאשר את תנאי השימוש', type: 'error' }); return }

    setLoading(true)
    try {
      const result = await sendOtp(form.phone)
      setConfirmation(result)
      setStep(2)
      toast({ message: 'קוד אימות נשלח ב-SMS', type: 'success' })
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    try {
      const result = await sendOtp(form.phone)
      setConfirmation(result)
      toast({ message: 'קוד חדש נשלח!', type: 'success' })
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleStep2(e) {
    e.preventDefault()
    if (code.length !== 6) { toast({ message: 'יש להזין קוד בן 6 ספרות', type: 'error' }); return }

    setLoading(true)
    try {
      await verifyOtpAndLogin(confirmation, code, {
        name:          form.name,
        phone:         form.phone,
        birthDate:     form.birthDate || null,
        gender:        form.gender || null,
        termsAccepted: form.termsAccepted,
      })
      toast({ message: 'נרשמת בהצלחה! ברוך הבא 👋', type: 'success' })
      navigate(redirect, { replace: true })
    } catch (err) {
      const msg = err.message?.includes('already registered')
        ? 'מספר טלפון זה כבר רשום. נסה להיכנס.'
        : (err.message ?? 'שגיאה בהרשמה')
      toast({ message: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pt-24 pb-16 bg-[var(--color-surface)] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="card w-full max-w-md mx-4 p-8"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-3"
            style={{ background: 'var(--color-gold)' }}
          >
            {BUSINESS.logoText}
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יצירת חשבון</h1>
          <p className="text-muted text-sm mt-1">{BUSINESS.name}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: step >= s ? 'var(--color-gold)' : 'var(--color-border)',
                  color: step >= s ? '#fff' : 'var(--color-muted)',
                }}
              >
                {s}
              </div>
              {s < 2 && <div className="w-8 h-px" style={{ background: step > s ? 'var(--color-gold)' : 'var(--color-border)' }} />}
            </div>
          ))}
          <span className="text-xs text-muted mr-2">שלב {step} מתוך 2</span>
        </div>

        {/* Step 1 — details */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם מלא</label>
              <input
                className="input"
                type="text"
                placeholder="ישראל ישראלי"
                autoComplete="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">מספר טלפון</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-0000000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תאריך לידה <span className="text-muted font-normal">(אופציונלי)</span></label>
              <input
                className="input"
                type="date"
                autoComplete="bday"
                value={form.birthDate}
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">מגדר <span className="text-muted font-normal">(אופציונלי)</span></label>
              <div className="flex gap-2">
                {GENDERS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, gender: f.gender === g.value ? '' : g.value }))}
                    className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                    style={
                      form.gender === g.value
                        ? { background: 'var(--color-gold)', color: '#fff', border: '2px solid var(--color-gold)' }
                        : { background: 'transparent', color: 'var(--color-text)', border: '2px solid var(--color-border)' }
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={e => setForm(f => ({ ...f, termsAccepted: e.target.checked }))}
                className="mt-0.5 accent-[var(--color-gold)]"
                required
              />
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                קראתי ומסכים/ה ל
                <a href="/privacy" className="mx-1 underline" style={{ color: 'var(--color-gold)' }}>תנאי השימוש ומדיניות הפרטיות</a>
              </span>
            </label>

            <button type="submit" className="btn-primary justify-center mt-2" disabled={loading}>
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד אימות SMS'}
            </button>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="flex flex-col gap-5">
            <div className="text-center">
              <div className="text-4xl mb-2">📱</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>שלחנו קוד אימות ב-SMS למספר</p>
              <p className="font-semibold mt-1" dir="ltr">{form.phone}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-center">קוד אימות (6 ספרות)</label>
              <input
                className="input text-center text-2xl tracking-widest font-bold"
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                dir="ltr"
                autoFocus
              />
            </div>

            <button type="submit" className="btn-primary justify-center" disabled={loading || code.length !== 6}>
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'אמת וצור חשבון'}
            </button>

            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={handleResend} disabled={loading} className="text-sm" style={{ color: 'var(--color-gold)' }}>
                שלח שוב
              </button>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <button type="button" onClick={() => setStep(1)} className="text-sm" style={{ color: 'var(--color-muted)' }}>
                ← חזור
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-muted mt-6">
          כבר יש לך חשבון?{' '}
          <Link
            to={`/login${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
            className="font-semibold hover:underline"
            style={{ color: 'var(--color-gold)' }}
          >
            כניסה
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
