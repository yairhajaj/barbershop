import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'

export function Register() {
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()

  const redirect = searchParams.get('redirect') ?? '/'

  async function handleSubmit(e) {
    e.preventDefault()

    const cleanPhone = form.phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 9) {
      toast({ message: 'מספר טלפון לא תקין', type: 'error' })
      return
    }
    if (form.password !== form.confirmPassword) {
      toast({ message: 'הסיסמאות אינן תואמות', type: 'error' })
      return
    }
    if (form.password.length < 6) {
      toast({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await signUp({ name: form.name, phone: form.phone, password: form.password })
      toast({ message: 'נרשמת בהצלחה! ברוך הבא 👋', type: 'success' })
      navigate(redirect, { replace: true })
    } catch (err) {
      const msg = err.message?.includes('already registered')
        ? 'מספר טלפון זה כבר רשום. נסה להיכנס.'
        : (err.message ?? 'שגיאה ברישום')
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
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-3"
            style={{ background: 'var(--color-gold)' }}
          >
            {BUSINESS.logoText}
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יצירת חשבון</h1>
          <p className="text-muted text-sm mt-1">{BUSINESS.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <button
            type="submit"
            className="btn-primary justify-center mt-2"
            disabled={loading}
          >
            {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'צור חשבון'}
          </button>

          <p className="text-center text-xs text-muted mt-3" style={{ opacity: 0.7 }}>
            בהרשמה אתה מסכים ל
            <a href="/privacy" className="underline mx-1" style={{ color: 'var(--color-gold)' }}>מדיניות הפרטיות</a>
            שלנו
          </p>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          כבר יש לך חשבון?{' '}
          <Link
            to={`/login${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
            className="font-semibold text-[var(--color-gold)] hover:underline"
          >
            כניסה
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
