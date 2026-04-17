import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'
import { supabase } from '../../lib/supabase'

const GENDERS = [
  { value: 'male',   label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other',  label: 'אחר' },
]

export function Register() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', phone: '', password: '', confirmPassword: '',
    birthDate: '', gender: '', termsAccepted: false,
  })
  const [code, setCode]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef             = useRef(null)

  const { signUp }         = useAuth()
  const navigate           = useNavigate()
  const [searchParams]     = useSearchParams()
  const toast              = useToast()
  const redirect           = searchParams.get('redirect') ?? '/'

  useEffect(() => () => clearInterval(cooldownRef.current), [])

  function startCooldown() {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleStep1(e) {
    e.preventDefault()
    const cleanPhone = form.phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 9) { toast({ message: 'מספר טלפון לא תקין', type: 'error' }); return }
    if (form.password !== form.confirmPassword) { toast({ message: 'הסיסמאות אינן תואמות', type: 'error' }); return }
    if (form.password.length < 6) { toast({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים', type: 'error' }); return }
    if (!form.termsAccepted) { toast({ message: 'יש לאשר את תנאי השימוש', type: 'error' }); return }

    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('send-otp', { body: { phone: form.phone, purpose: 'register' } })
      if (error) throw error
      toast({ message: 'קוד אימות נשלח ב-WhatsApp!', type: 'success' })
      setStep(2)
      startCooldown()
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setLoading(true)
    try {
      await supabase.functions.invoke('send-otp', { body: { phone: form.phone, purpose: 'register' } })
      toast({ message: 'קוד חדש נשלח!', type: 'success' })
      startCooldown()
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
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('verify-otp', {
        body: { phone: form.phone, code, purpose: 'register' },
      })
      if (verifyErr) throw verifyErr
      if (!verifyData?.valid) throw new Error(verifyData?.error ?? 'קוד שגוי')

      const data = await signUp({
        name: form.name,
        phone: form.phone,
        password: form.password,
        birthDate: form.birthDate || null,
        gender: form.gender || null,
        termsAccepted: form.termsAccepted,
      })
      // Migrate guest profile (manually created by admin) → new auth profile
      if (data?.user?.id) {
        const cleanPhone = form.phone.replace(/\D/g, '')
        const { data: guest } = await supabase.from('profiles').select('id').eq('phone', cleanPhone).eq('is_guest', true).maybeSingle()
        if (guest) {
          await Promise.all([
            supabase.from('appointments').update({ customer_id: data.user.id }).eq('customer_id', guest.id),
            supabase.from('customer_debts').update({ customer_id: data.user.id }).eq('customer_id', guest.id),
          ])
          await supabase.from('profiles').delete().eq('id', guest.id)
        }
      }
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

        {/* Step 1 */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם מלא</label>
              <input
                className="input"
                type="text"
                placeholder="ישראל ישראלי"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">מספר טלפון</label>
              <input
                className="input"
                type="tel"
                placeholder="050-0000000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">סיסמה</label>
              <input
                className="input"
                type="password"
                placeholder="לפחות 6 תווים"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">אישור סיסמה</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תאריך לידה <span className="text-muted font-normal">(אופציונלי)</span></label>
              <input
                className="input"
                type="date"
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
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד אימות ב-WhatsApp'}
            </button>
          </form>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="flex flex-col gap-5">
            <div className="text-center">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                שלחנו קוד אימות ב-WhatsApp למספר
              </p>
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
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-sm"
                style={{ color: cooldown > 0 ? 'var(--color-muted)' : 'var(--color-gold)' }}
              >
                {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח שוב'}
              </button>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm"
                style={{ color: 'var(--color-muted)' }}
              >
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
