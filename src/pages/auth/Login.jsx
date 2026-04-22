import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'

const gi = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'white',
  borderRadius: '10px',
  padding: '10px 14px',
  width: '100%',
  outline: 'none',
  fontSize: '0.95rem',
}

export function Login() {
  const [phone, setPhone]           = useState('')
  const [code, setCode]             = useState('')
  const [step, setStep]             = useState('phone') // 'phone' | 'otp'
  const [confirmation, setConfirmation] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [cooldown, setCooldown]     = useState(0)
  const cooldownRef                 = useRef(null)

  const { sendOtp, verifyOtpAndLogin } = useAuth()
  const navigate                    = useNavigate()
  const [searchParams]              = useSearchParams()
  const toast                       = useToast()
  const redirect                    = searchParams.get('redirect') ?? '/'
  const { settings }                = useBusinessSettings()

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
      setCooldown(p => { if (p <= 1) { clearInterval(cooldownRef.current); return 0 } return p - 1 })
    }, 1000)
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!phone) return
    setLoading(true)
    try {
      const result = await sendOtp(phone)
      setConfirmation(result)
      setStep('otp')
      startCooldown()
      toast({ message: 'קוד נשלח ב-SMS', type: 'success' })
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' })
    } finally { setLoading(false) }
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    try {
      await verifyOtpAndLogin(confirmation, code)
      navigate(redirect, { replace: true })
    } catch (err) {
      toast({ message: err.message ?? 'קוד שגוי', type: 'error' })
    } finally { setLoading(false) }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return
    setLoading(true)
    try {
      const result = await sendOtp(phone)
      setConfirmation(result)
      startCooldown()
      toast({ message: 'קוד חדש נשלח!', type: 'success' })
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה', type: 'error' })
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
          style={{ background: 'linear-gradient(160deg, rgba(0,0,0,0.55) 0%, rgba(8,5,2,0.75) 100%)' }} />
      </div>

      {/* ── Fixed glass card ── */}
      <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-[340px]"
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
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4"
              style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(201,169,110,0.4)' }}>
              {BUSINESS.logoText}
            </div>
            <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              כניסה
            </h1>
            <p className="text-sm" style={{ color: 'rgba(201,169,110,0.85)', fontStyle: 'italic' }}>{BUSINESS.name}</p>
          </div>

          <AnimatePresence mode="wait">
            {/* ── שלב 1: מספר טלפון ── */}
            {step === 'phone' && (
              <motion.form key="phone"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSendOtp} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.6)' }}>מספר טלפון</label>
                  <input className="gi" style={gi} type="tel" inputMode="tel" autoComplete="tel"
                    placeholder="050-0000000" value={phone} dir="ltr" autoFocus
                    onChange={e => setPhone(e.target.value)} required />
                </div>
                <button type="submit" className="btn-primary justify-center mt-1" disabled={loading || !phone}>
                  {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד'}
                </button>
              </motion.form>
            )}

            {/* ── שלב 2: קוד OTP ── */}
            {step === 'otp' && (
              <motion.form key="otp"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerify} className="flex flex-col gap-4">
                <div className="text-center mb-1">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    הזן את הקוד שנשלח ל-
                  </p>
                  <p className="font-semibold text-white" dir="ltr">{phone}</p>
                </div>
                <input className="gi text-center text-3xl tracking-[0.35em] font-bold" style={gi}
                  type="tel" inputMode="numeric" maxLength={6} placeholder="——————"
                  value={code} dir="ltr" autoFocus autoComplete="one-time-code"
                  onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
                <button type="submit" className="btn-primary justify-center" disabled={loading || code.length !== 6}>
                  {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'כניסה'}
                </button>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <button type="button" onClick={handleResend} disabled={cooldown > 0 || loading}
                    style={{ color: cooldown > 0 ? 'rgba(255,255,255,0.3)' : 'var(--color-gold)' }}>
                    {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח שוב'}
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <button type="button" onClick={() => { setStep('phone'); setCode('') }}
                    style={{ color: 'rgba(255,255,255,0.4)' }}>
                    שנה מספר
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="mt-7 flex flex-col items-center gap-2">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              אין לך חשבון?{' '}
              <Link to={`/register${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
                className="font-semibold hover:underline" style={{ color: 'var(--color-gold)' }}>
                הרשמה
              </Link>
            </p>
            <Link to="/" className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ← חזרה לדף הבית
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  )
}
