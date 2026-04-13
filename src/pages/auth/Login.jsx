import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { BUSINESS } from '../../config/business'

export function Login() {
  const [form, setForm]     = useState({ phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { signIn }    = useAuth()
  const navigate      = useNavigate()
  const [searchParams] = useSearchParams()
  const toast          = useToast()

  const redirect = searchParams.get('redirect') ?? '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(form)
      navigate(redirect, { replace: true })
    } catch (err) {
      toast({ message: 'מספר טלפון או סיסמה שגויים', type: 'error' })
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>כניסה לחשבון</h1>
          <p className="text-muted text-sm mt-1">{BUSINESS.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary justify-center mt-2"
            disabled={loading}
          >
            {loading ? <Spinner size="sm" className="border-white border-t-transparent" /> : 'כניסה'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          אין לך חשבון?{' '}
          <Link
            to={`/register${redirect !== '/' ? `?redirect=${redirect}` : ''}`}
            className="font-semibold text-[var(--color-gold)] hover:underline"
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
