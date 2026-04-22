import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'
import { supabase } from '../../lib/supabase'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'

const GENDERS = [
  { value: 'male',   label: 'זכר' },
  { value: 'female', label: 'נקבה' },
  { value: 'other',  label: 'אחר' },
]

const gi = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'white',
  borderRadius: '10px',
  padding: '10px 14px',
  width: '100%',
  outline: 'none',
  fontSize: '0.9rem',
}

export function Register() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', phone: '',
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
  const phoneFromUrl       = searchParams.get('phone') ?? ''
  const { settings }       = useBusinessSettings()

  // pre-fill phone from URL (e.g. redirected from login when no profile found)
  useEffect(() => {
    if (phoneFromUrl) setForm(f => ({ ...f, phone: phoneFromUrl }))
  }, [phoneFromUrl])

  // hero bg
  const heroType = settings?.hero_type || localStorage.getItem('hero_type') || BUSINESS.heroType
  const heroSrc  = settings?.hero_image_url || localStorage.getItem('hero_image_url') || BUSINESS.heroSrc
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && heroType === 'video') videoRef.current.play().catch(() => {})
  }, [heroType, heroSrc])

  useEffect(() => () => clearInterval(cooldownRef.current), [])

  function startCooldown() {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current); return 0 } return prev - 1 })
    }, 1000)
  }

  async function handleStep1(e) {
    e.preventDefault()
    const cleanPhone = form.phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 9) { toast({ message: 'מספר טלפון לא תקין', type: 'error' }); return }
    if (!form.termsAccepted) { toast({ message: 'יש לאשר את תנאי השימוש', type: 'error' }); return }

    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('send-otp', { body: { phone: form.phone, purpose: 'register' } })
      if (error) throw error
      toast({ message: 'קוד אימות נשלח ב-WhatsApp!', type: 'success' })
      setStep(2); startCooldown()
    } catch (err) { toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' }) }
    finally { setLoading(false) }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setLoading(true)
    try {
      await supabase.functions.invoke('send-otp', { body: { phone: form.phone, purpose: 'register' } })
      toast({ message: 'קוד חדש נשלח!', type: 'success' }); startCooldown()
    } catch (err) { toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' }) }
    finally { setLoading(false) }
  }

  async function handleStep2(e, autoCode) {
    if (e) e.preventDefault()
    const finalCode = autoCode ?? code
    if (finalCode.length !== 6) { toast({ message: 'יש להזין קוד בן 6 ספרות', type: 'error' }); return }

    setLoading(true)
    try {
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('verify-otp', {
        body: { phone: form.phone, code: finalCode, purpose: 'register' },
      })
      if (verifyErr) throw verifyErr
      if (!verifyData?.valid) throw new Error(verifyData?.error ?? 'קוד שגוי')

      const data = await signUp({
        name: form.name, phone: form.phone,
        birthDate: form.birthDate || null, gender: form.gender || null,
        termsAccepted: form.termsAccepted,
      })
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
    } finally { setLoading(false) }
  }

  return (
    <>
      <style>{`
        .gi::placeholder { color: rgba(255,255,255,0.35); }
        .gi:focus { border-color: rgba(201,169,110,0.65) !important; box-shadow: 0 0 0 3px rgba(201,169,110,0.12); }
      `}</style>

      {/* ── Fixed blurred background ── */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        {heroType === 'video' && heroSrc ? (
          <video ref={videoRef} src={heroSrc} autoPlay muted loop playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(8px)', transform: 'scale(1.04)' }} />
        ) : heroSrc ? (
          <img src={heroSrc} alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(8px)', transform: 'scale(1.04)' }} />
        ) : (
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #0c0a06 0%, #1c1409 50%, #0c0a06 100%)' }} />
        )}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, rgba(0,0,0,0.62) 0%, rgba(8,5,2,0.82) 100%)' }} />
      </div>

      {/* ── Fixed glass card — no page scroll, card scrolls internally if needed ── */}
      <div className="fixed inset-0 z-10 flex items-center justify-center px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }}>
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-[380px] overflow-y-auto"
          style={{ maxHeight: '92vh',
            backdropFilter: 'blur(30px) saturate(160%)',
            WebkitBackdropFilter: 'blur(30px) saturate(160%)',
            background: 'rgba(10, 8, 4, 0.58)',
            border: '1px solid rgba(255,255,255,0.13)',
            borderTop: '1px solid rgba(255,255,255,0.22)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)',
            borderRadius: '28px',
            padding: '36px 28px 28px',
          }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4"
              style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(201,169,110,0.4)' }}>
              {BUSINESS.logoText}
            </div>
            <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              יצירת חשבון
            </h1>
            <p className="text-sm" style={{ color: 'rgba(201,169,110,0.85)', fontStyle: 'italic' }}>{BUSINESS.name}</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: step >= s ? 'var(--color-gold)' : 'rgba(255,255,255,0.12)',
                    color: step >= s ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}>
                  {s}
                </div>
                {s < 2 && <div className="w-8 h-px"
                  style={{ background: step > s ? 'var(--color-gold)' : 'rgba(255,255,255,0.15)' }} />}
              </div>
            ))}
            <span className="text-xs mr-2" style={{ color: 'rgba(255,255,255,0.4)' }}>שלב {step} מתוך 2</span>
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>שם מלא</label>
                <input className="gi" style={gi} type="text" placeholder="ישראל ישראלי" autoComplete="name"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>מספר טלפון</label>
                <input className="gi" style={gi} type="tel" inputMode="tel" autoComplete="tel"
                  placeholder="050-0000000" value={form.phone} dir="ltr"
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>
                  תאריך לידה <span className="normal-case font-normal opacity-60">(אופציונלי)</span>
                </label>
                <input className="gi" style={gi} type="text" inputMode="numeric"
                  placeholder="DD/MM/YYYY" autoComplete="bday"
                  value={form.birthDate}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wide uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>
                  מגדר <span className="normal-case font-normal opacity-60">(אופציונלי)</span>
                </label>
                <div className="flex gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} type="button"
                      onClick={() => setForm(f => ({ ...f, gender: f.gender === g.value ? '' : g.value }))}
                      className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                      style={
                        form.gender === g.value
                          ? { background: 'var(--color-gold)', color: '#fff', border: '2px solid var(--color-gold)' }
                          : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', border: '2px solid rgba(255,255,255,0.18)' }
                      }>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={form.termsAccepted}
                  onChange={e => setForm(f => ({ ...f, termsAccepted: e.target.checked }))}
                  className="mt-0.5 accent-[var(--color-gold)]" required />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  קראתי ומסכים/ה ל
                  <a href="/privacy" className="mx-1 underline" style={{ color: 'var(--color-gold)' }}>
                    תנאי השימוש ומדיניות הפרטיות
                  </a>
                </span>
              </label>

              <button type="submit" className="btn-primary justify-center mt-1" disabled={loading}>
                {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד אימות ב-WhatsApp'}
              </button>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="flex flex-col gap-5">
              <div className="text-center">
                <div className="text-4xl mb-2">💬</div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>שלחנו קוד אימות ב-WhatsApp למספר</p>
                <p className="font-semibold mt-1 text-white" dir="ltr">{form.phone}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 text-center tracking-wide uppercase"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>קוד אימות (6 ספרות)</label>
                <input className="gi text-center text-2xl tracking-widest font-bold" style={gi}
                  type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                  value={code} dir="ltr" autoFocus autoComplete="one-time-code"
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6)
                    setCode(val)
                    if (val.length === 6) handleStep2(null, val)
                  }} />
              </div>

              <button type="submit" className="btn-primary justify-center" disabled={loading || code.length !== 6}>
                {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'אמת וצור חשבון'}
              </button>

              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={handleResend} disabled={cooldown > 0 || loading}
                  className="text-sm"
                  style={{ color: cooldown > 0 ? 'rgba(255,255,255,0.3)' : 'var(--color-gold)' }}>
                  {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח שוב'}
                </button>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                <button type="button" onClick={() => setStep(1)} className="text-sm"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>
                  ← חזור
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              כבר יש לך חשבון?{' '}
              <Link to={`/login${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
                className="font-semibold hover:underline" style={{ color: 'var(--color-gold)' }}>
                כניסה
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  )
}
