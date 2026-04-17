import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import { formatDateFull, formatTime } from '../../lib/utils'

export function RescheduleConfirm() {
  const [params]  = useSearchParams()
  const token     = params.get('token')
  const action    = params.get('action')

  const [phase,  setPhase]  = useState('loading')
  const [offer,  setOffer]  = useState(null)
  const [result, setResult] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  // 1. Load offer by token
  useEffect(() => {
    if (!token) { setPhase('error'); setErrMsg('קישור לא תקין — חסר טוקן'); return }

    supabase
      .from('reschedule_offers')
      .select('*, appointments(id, start_at, end_at, services(name), staff(name))')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); setErrMsg('קישור לא תקין'); return }
        if (data.status === 'accepted') { setPhase('done'); setResult({ action: 'accepted', newStart: data.offered_start_at, serviceName: data.appointments?.services?.name }); return }
        if (data.status === 'declined') { setPhase('done'); setResult({ action: 'declined' }); return }
        if (data.status === 'expired')  { setPhase('error'); setErrMsg('ההצעה פגה'); return }
        if (data.status !== 'pending')  { setPhase('error'); setErrMsg('ההצעה כבר לא פעילה'); return }
        if (new Date(data.token_expires_at) < new Date()) { setPhase('error'); setErrMsg('ההצעה פגה — הזמן עבר'); return }
        setOffer(data)
        setPhase('confirm')
      })
  }, [token])

  // 2. Auto-process if action param present
  useEffect(() => {
    if (phase === 'confirm' && action && offer) {
      handleAction(action)
    }
  }, [phase, offer])

  async function handleAction(act) {
    setPhase('processing')
    try {
      const { data, error } = await supabase.functions.invoke('handle-reschedule', {
        body: { token, action: act },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setResult(data)
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrMsg(err.message ?? 'שגיאה בעיבוד הבקשה')
    }
  }

  const offeredStart  = offer?.offered_start_at ? new Date(offer.offered_start_at) : null
  const originalStart = offer?.original_start_at ? new Date(offer.original_start_at) : null

  // ── Screens ───────────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'processing') {
    return (
      <Screen>
        <Spinner size="lg" />
        <p className="mt-4 text-sm" style={{ color: 'var(--color-muted)' }}>
          {phase === 'processing' ? 'מעבד...' : 'טוען...'}
        </p>
      </Screen>
    )
  }

  if (phase === 'error') {
    return (
      <Screen>
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-black mb-2" style={{ color: 'var(--color-text)' }}>שגיאה</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>{errMsg}</p>
        <Link to="/" className="btn-primary px-6 py-2.5 text-sm">חזרה לדף הבית</Link>
      </Screen>
    )
  }

  if (phase === 'done') {
    const accepted = result?.action === 'accepted'
    return (
      <Screen>
        <div className="text-5xl mb-4">{accepted ? '✅' : '👋'}</div>
        <h1 className="text-xl font-black mb-2" style={{ color: 'var(--color-text)' }}>
          {accepted ? 'התור הוקדם בהצלחה!' : 'ביטלת את ההקדמה'}
        </h1>
        {accepted && result.newStart && (
          <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
            {result.serviceName && <span>{result.serviceName} — </span>}
            {formatTime(new Date(result.newStart))}
            {result.staffName && <span className="mx-1">עם {result.staffName}</span>}
          </p>
        )}
        {!accepted && (
          <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
            התור שלך נשאר בשעה המקורית
          </p>
        )}
        <Link to="/" className="btn-primary px-6 py-2.5 text-sm mt-6 inline-block">חזרה לדף הבית</Link>
      </Screen>
    )
  }

  // ── Confirm phase ───────────────────────────────────────────────
  return (
    <Screen>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📅</div>
          <h1 className="text-xl font-black" style={{ color: 'var(--color-text)' }}>הקדמת תור</h1>
          {offer.appointments?.services?.name && (
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              {offer.appointments.services.name}
              {offer.appointments.staff?.name && ` עם ${offer.appointments.staff.name}`}
            </p>
          )}
        </div>

        {/* Time comparison */}
        <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex justify-center items-center gap-6">
            <div className="text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>תור נוכחי</p>
              <p className="font-bold text-lg line-through opacity-60" style={{ color: 'var(--color-text)' }}>
                {originalStart ? formatTime(originalStart) : '—'}
              </p>
              {originalStart && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {formatDateFull(originalStart)}
                </p>
              )}
            </div>
            <div className="text-2xl" style={{ color: 'var(--color-gold)' }}>→</div>
            <div className="text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>תור מוצע</p>
              <p className="font-black text-lg" style={{ color: 'var(--color-gold)' }}>
                {offeredStart ? formatTime(offeredStart) : '—'}
              </p>
              {offeredStart && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {formatDateFull(offeredStart)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleAction('accept')}
            className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm transition-all"
            style={{ background: 'var(--color-gold)' }}
          >
            אישור הקדמה ✓
          </button>
          <button
            onClick={() => handleAction('decline')}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            לא מתאים
          </button>
        </div>
      </motion.div>
    </Screen>
  )
}

function Screen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--color-surface)' }}>
      <div className="text-center w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
