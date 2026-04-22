import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'
import { supabase } from '../../lib/supabase'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'

// ─── shared glass-input style ───────────────────────────────────────────────
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

export function Login() {
  const [form, setForm]       = useState({ phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { signIn }            = useAuth()
  const navigate              = useNavigate()
  const [searchParams]        = useSearchParams()
  const toast                 = useToast()
  const redirect              = searchParams.get('redirect') ?? '/'
  const { settings }          = useBusinessSettings()

  // hero bg
  const heroType = settings?.hero_type || localStorage.getItem('hero_type') || BUSINESS.heroType
  const heroSrc  = settings?.hero_image_url || localStorage.getItem('hero_image_url') || BUSINESS.heroSrc
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && heroType === 'video') {
      videoRef.current.play().catch(() => {})
    }
  }, [heroType, heroSrc])

  // Forgot password state
  const [forgotStep, setForgotStep] = useState(null)
  const [fpPhone, setFpPhone]       = useState('')
  const [fpCode, setFpCode]         = useState('')
  const [fpPass, setFpPass]         = useState('')
  const [fpPassConf, setFpPassConf] = useState('')
  const [fpLoading, setFpLoading]   = useState(false)
  const [cooldown, setCooldown]     = useState(0)
  const cooldownRef                 = useRef(null)
  useEffect(() => () => clearInterval(cooldownRef.current), [])

  function startCooldown() {
    setCooldown(60)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current); return 0 } return prev - 1 })
    }, 1000)
  }

  function resetForgot() {
    setForgotStep(null); setFpPhone(''); setFpCode(''); setFpPass(''); setFpPassConf('')
    setCooldown(0); clearInterval(cooldownRef.current)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try { await signIn(form); navigate(redirect, { replace: true }) }
    catch { toast({ message: 'מספר טלפון או סיסמה שגויים', type: 'error' }) }
    finally { setLoading(false) }
  }

  async function handleFpSendOtp(phone) {
    setFpLoading(true)
    try {
      const { error } = await supabase.functions.invoke('send-otp', { body: { phone, purpose: 'forgot_password' } })
      if (error) throw error
      toast({ message: 'קוד נשלח ב-WhatsApp!', type: 'success' })
      setForgotStep('otp'); startCooldown()
    } catch (err) { toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' }) }
    finally { setFpLoading(false) }
  }

  async function handleFpVerifyOtp(e) {
    e.preventDefault()
    if (fpCode.length !== 6) { toast({ message: 'יש להזין קוד בן 6 ספרות', type: 'error' }); return }
    setFpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', { body: { phone: fpPhone, code: fpCode, purpose: 'forgot_password' } })
      if (error) throw error
      if (!data?.valid) throw new Error(data?.error ?? 'קוד שגוי')
      setForgotStep('password')
    } catch (err) { toast({ message: err.message ?? 'קוד שגוי', type: 'error' }) }
    finally { setFpLoading(false) }
  }

  async function handleFpResetPassword(e) {
    e.preventDefault()
    if (fpPass.length < 6) { toast({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים', type: 'error' }); return }
    if (fpPass !== fpPassConf) { toast({ message: 'הסיסמאות אינן תואמות', type: 'error' }); return }
    setFpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', { body: { phone: fpPhone, code: fpCode, newPassword: fpPass } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setForgotStep('done')
    } catch (err) { toast({ message: err.message ?? 'שגיאה באיפוס הסיסמה', type: 'error' }) }
    finally { setFpLoading(false) }
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
          <video
            ref={videoRef}
            src={heroSrc}
            autoPlay muted loop playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(8px)', transform: 'scale(1.04)' }}
          />
        ) : heroSrc ? (
          <img
            src={heroSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(8px)', transform: 'scale(1.04)' }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0c0a06 0%, #1c1409 50%, #0c0a06 100%)' }} />
        )}
        {/* dark overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(0,0,0,0.62) 0%, rgba(8,5,2,0.82) 100%)' }} />
      </div>

      {/* ── Centered glass card — fixed, no page scroll ── */}
      <div className="fixed inset-0 z-10 flex items-center justify-center px-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-[360px]"
          style={{
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
          <div className="text-center mb-7">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4"
              style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(201,169,110,0.4)' }}
            >
              {BUSINESS.logoText}
            </div>
            <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              כניסה לחשבון
            </h1>
            <p className="text-sm" style={{ color: 'rgba(201,169,110,0.85)', fontStyle: 'italic' }}>{BUSINESS.name}</p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>
                מספר טלפון
              </label>
              <input className="gi" style={gi} type="tel" inputMode="tel" autoComplete="tel"
                placeholder="050-0000000" value={form.phone} dir="ltr"
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>
                סיסמה
              </label>
              <input className="gi" style={gi} type="password" autoComplete="current-password"
                placeholder="••••••••" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>

            <button type="submit" className="btn-primary justify-center mt-1" disabled={loading}>
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'כניסה'}
            </button>
          </form>

          {/* Forgot password trigger */}
          <div className="text-center mt-3">
            <button type="button" onClick={() => { setForgotStep('phone'); setFpPhone(form.phone) }}
              className="text-sm" style={{ color: 'var(--color-gold)' }}>
              שכחתי סיסמה
            </button>
          </div>

          {/* Forgot password panel */}
          {forgotStep && (
            <div className="mt-4 rounded-2xl p-4 relative"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button type="button" onClick={resetForgot}
                className="absolute top-3 left-3 text-xs"
                style={{ color: 'rgba(255,255,255,0.45)' }}>
                ✕ ביטול
              </button>
              <h3 className="font-semibold text-center mb-4 mt-1 text-white text-sm">איפוס סיסמה</h3>

              {forgotStep === 'phone' && (
                <div className="flex flex-col gap-3">
                  <input className="gi" style={gi} type="tel" inputMode="tel" autoComplete="tel"
                    placeholder="050-0000000" value={fpPhone} dir="ltr" autoFocus
                    onChange={e => setFpPhone(e.target.value)} />
                  <button type="button" className="btn-primary justify-center text-sm" disabled={fpLoading || !fpPhone}
                    onClick={() => handleFpSendOtp(fpPhone)}>
                    {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד'}
                  </button>
                </div>
              )}

              {forgotStep === 'otp' && (
                <form onSubmit={handleFpVerifyOtp} className="flex flex-col gap-3">
                  <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    הזן את הקוד שנשלח ל-{fpPhone}
                  </p>
                  <input className="gi text-center text-2xl tracking-widest font-bold" style={gi}
                    type="tel" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={fpCode} dir="ltr" autoFocus
                    onChange={e => setFpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
                  <button type="submit" className="btn-primary justify-center text-sm" disabled={fpLoading || fpCode.length !== 6}>
                    {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'אמת'}
                  </button>
                  <div className="text-center">
                    <button type="button" onClick={() => handleFpSendOtp(fpPhone)} disabled={cooldown > 0 || fpLoading}
                      className="text-xs" style={{ color: cooldown > 0 ? 'rgba(255,255,255,0.35)' : 'var(--color-gold)' }}>
                      {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח שוב'}
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 'password' && (
                <form onSubmit={handleFpResetPassword} className="flex flex-col gap-3">
                  <input className="gi" style={gi} type="password" autoComplete="new-password"
                    placeholder="סיסמה חדשה (לפחות 6 תווים)" value={fpPass} autoFocus
                    onChange={e => setFpPass(e.target.value)} />
                  <input className="gi" style={gi} type="password" autoComplete="new-password"
                    placeholder="אישור סיסמה" value={fpPassConf}
                    onChange={e => setFpPassConf(e.target.value)} />
                  <button type="submit" className="btn-primary justify-center text-sm" disabled={fpLoading}>
                    {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שמור סיסמה חדשה'}
                  </button>
                </form>
              )}

              {forgotStep === 'done' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="text-3xl">✅</div>
                  <p className="font-semibold text-center text-white text-sm">הסיסמה עודכנה! אנא התחבר</p>
                  <button type="button" className="btn-primary justify-center w-full text-sm" onClick={resetForgot}>
                    חזור לכניסה
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer links */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              אין לך חשבון?{' '}
              <Link to={`/register${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
                className="font-semibold hover:underline" style={{ color: 'var(--color-gold)' }}>
                הרשמה
              </Link>
            </p>
            <Link to="/" className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              ← חזרה לדף הבית
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  )
}
