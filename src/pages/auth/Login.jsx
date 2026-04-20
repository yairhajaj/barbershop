import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'

export function Login() {
  const [phone, setPhone]                   = useState('')
  const [code, setCode]                     = useState('')
  const [step, setStep]                     = useState('phone') // 'phone' | 'otp'
  const [confirmation, setConfirmation]     = useState(null)
  const [loading, setLoading]               = useState(false)
  const { sendOtp, verifyOtpAndLogin }      = useAuth()
  const navigate                            = useNavigate()
  const [searchParams]                      = useSearchParams()
  const toast                               = useToast()
  const redirect                            = searchParams.get('redirect') ?? '/'

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!phone) return
    setLoading(true)
    try {
      const result = await sendOtp(phone)
      setConfirmation(result)
      setStep('otp')
      toast({ message: 'קוד נשלח ב-SMS', type: 'success' })
    } catch (err) {
      toast({ message: err.message ?? 'שגיאה בשליחת הקוד', type: 'error' })
    } finally {
      setLoading(false)
    }
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

        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">מספר טלפון</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-0000000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                dir="ltr"
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary justify-center mt-2" disabled={loading || !phone}>
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'שלח קוד'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
              הזן את הקוד שנשלח ל-{phone}
            </p>
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
            <button type="submit" className="btn-primary justify-center" disabled={loading || code.length !== 6}>
              {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'כניסה'}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="text-sm text-center"
              style={{ color: 'var(--color-muted)' }}
            >
              ← שנה מספר טלפון
            </button>
          </form>
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
