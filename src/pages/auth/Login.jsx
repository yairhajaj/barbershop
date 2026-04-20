import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'
import { supabase } from '../../lib/supabase'

export function Login() {
  const [form, setForm]       = useState({ phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { signIn }            = useAuth()
  const navigate              = useNavigate()
  const [searchParams]        = useSearchParams()
  const toast                 = useToast()
  const redirect              = searchParams.get('redirect') ?? '/'

  // Forgot password state: null | 'phone' | 'otp' | 'password' | 'done'
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
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function resetForgot() {
    setForgotStep(null)
    setFpPhone('')
    setFpCode('')
    setFpPass('')
    setFpPassConf('')
    setCooldown(0)
    clearInterval(cooldownRef.current)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(form)
      navigate(redirect, { replace: true })
    } catch {
      toast({ message: 'מספר טלפון או סיסמה שגויים', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function extractFnError(err, fallback) {
    if (err?.context?.json) {
      try { const b = await err.context.json(); return b.error || fallback } catch {}
    }
    return err?.message || fallback
  }

  async function handleFpSendOtp(phone) {
    setFpLoading(true)
    try {
      const { error } = await supabase.functions.invoke('send-otp', { body: { phone, purpose: 'forgot_password' } })
      if (error) throw error
      toast({ message: 'קוד נשלח ב-WhatsApp!', type: 'success' })
      setForgotStep('otp')
      startCooldown()
    } catch (err) {
      toast({ message: await extractFnError(err, 'שגיאה בשליחת הקוד'), type: 'error' })
    } finally {
      setFpLoading(false)
    }
  }

  async function handleFpVerifyOtp(e) {
    e.preventDefault()
    if (fpCode.length !== 6) { toast({ message: 'יש להזין קוד בן 6 ספרות', type: 'error' }); return }
    setFpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { phone: fpPhone, code: fpCode, purpose: 'forgot_password' },
      })
      if (error) throw error
      if (!data?.valid) throw new Error(data?.error ?? 'קוד שגוי')
      setForgotStep('password')
    } catch (err) {
      toast({ message: await extractFnError(err, 'קוד שגוי'), type: 'error' })
    } finally {
      setFpLoading(false)
    }
  }

  async function handleFpResetPassword(e) {
    e.preventDefault()
    if (fpPass.length < 6) { toast({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים', type: 'error' }); return }
    if (fpPass !== fpPassConf) { toast({ message: 'הסיסמאות אינן תואמות', type: 'error' }); return }
    setFpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { phone: fpPhone, code: fpCode, newPassword: fpPass },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setForgotStep('done')
    } catch (err) {
      toast({ message: await extractFnError(err, 'שגיאה באיפוס הסיסמה'), type: 'error' })
    } finally {
      setFpLoading(false)
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
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-3"
            style={{ background: 'var(--color-gold)' }}
          >
            {BUSINESS.logoText}
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>כניסה לחשבון</h1>
          <p className="text-muted text-sm mt-1">{BUSINESS.name}</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <button type="submit" className="btn-primary justify-center mt-2" disabled={loading}>
            {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'כניסה'}
          </button>
        </form>

        {/* Forgot password trigger */}
        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => { setForgotStep('phone'); setFpPhone(form.phone) }}
            className="text-sm"
            style={{ color: 'var(--color-gold)' }}
          >
            שכחתי סיסמה
          </button>
        </div>

        {/* Forgot password panel */}
        {forgotStep && (
          <div
            className="mt-5 rounded-xl p-5 relative"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
          >
            {/* Cancel button */}
            <button
              type="button"
              onClick={resetForgot}
              className="absolute top-3 left-3 text-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              ✕ ביטול
            </button>

            <h3 className="font-semibold text-center mb-4 mt-1">איפוס סיסמה</h3>

            {/* Step: phone */}
            {forgotStep === 'phone' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">מספר טלפון</label>
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="050-0000000"
                    value={fpPhone}
                    onChange={e => setFpPhone(e.target.value)}
                    dir="ltr"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary justify-center"
                  disabled={fpLoading || !fpPhone}
                  onClick={() => handleFpSendOtp(fpPhone)}
                >
                  {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד'}
                </button>
              </div>
            )}

            {/* Step: otp */}
            {forgotStep === 'otp' && (
              <form onSubmit={handleFpVerifyOtp} className="flex flex-col gap-3">
                <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
                  הזן את הקוד שנשלח ל-{fpPhone}
                </p>
                <input
                  className="input text-center text-2xl tracking-widest font-bold"
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={fpCode}
                  onChange={e => setFpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  dir="ltr"
                  autoFocus
                />
                <button type="submit" className="btn-primary justify-center" disabled={fpLoading || fpCode.length !== 6}>
                  {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'אמת'}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => handleFpSendOtp(fpPhone)}
                    disabled={cooldown > 0 || fpLoading}
                    className="text-sm"
                    style={{ color: cooldown > 0 ? 'var(--color-muted)' : 'var(--color-gold)' }}
                  >
                    {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח שוב'}
                  </button>
                </div>
              </form>
            )}

            {/* Step: new password */}
            {forgotStep === 'password' && (
              <form onSubmit={handleFpResetPassword} className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">סיסמה חדשה</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="לפחות 6 תווים"
                    value={fpPass}
                    onChange={e => setFpPass(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">אישור סיסמה</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={fpPassConf}
                    onChange={e => setFpPassConf(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary justify-center" disabled={fpLoading}>
                  {fpLoading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שמור סיסמה חדשה'}
                </button>
              </form>
            )}

            {/* Step: done */}
            {forgotStep === 'done' && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-center">הסיסמה עודכנה! אנא התחבר</p>
                <button
                  type="button"
                  className="btn-primary justify-center w-full"
                  onClick={resetForgot}
                >
                  חזור לכניסה
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted mt-6">
          אין לך חשבון?{' '}
          <Link
            to={`/register${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
            className="font-semibold hover:underline"
            style={{ color: 'var(--color-gold)' }}
          >
            הרשמה
          </Link>
        </p>

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-muted hover:text-gray-600">← חזרה לדף הבית</Link>
        </div>
      </motion.div>
    </div>
  )
}
