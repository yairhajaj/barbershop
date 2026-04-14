import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import { formatDateFull, formatTime } from '../../lib/utils'

export function WaitlistConfirm() {
  const [params]  = useSearchParams()
  const token     = params.get('token')
  const action    = params.get('action') // 'accept' | 'decline'

  const [phase,  setPhase]  = useState('loading')   // loading | confirm | processing | done | error
  const [entry,  setEntry]  = useState(null)
  const [result, setResult] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  // 1. Load entry by token
  useEffect(() => {
    if (!token) { setPhase('error'); setErrMsg('קישור לא תקין — חסר טוקן'); return }

    supabase
      .from('waitlist')
      .select('*, services(name), profiles(name)')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); setErrMsg('קישור לא תקין'); return }
        if (data.status === 'booked')   { setPhase('done');  setResult({ action: 'booked',  slotStart: data.offered_slot_start, serviceName: data.services?.name }); return }
        if (data.status === 'declined') { setPhase('done');  setResult({ action: 'declined' }); return }
        if (data.status !== 'notified') { setPhase('error'); setErrMsg('ההצעה כבר לא פעילה'); return }
        if (new Date(data.token_expires_at) < new Date()) { setPhase('error'); setErrMsg('ההצעה פגה — התור כבר לא זמין'); return }
        setEntry(data)
        setPhase('confirm')
      })
  }, [token])

  // 2. Auto-process action from URL (if action param provided, skip confirm screen)
  useEffect(() => {
    if (phase === 'confirm' && action && entry) {
      handleAction(action)
    }
  }, [phase, entry])

  async function handleAction(act) {
    setPhase('processing')
    try {
      const { data, error } = await supabase.functions.invoke('notify-waitlist', {
        body: { mode: 'respond', token, action: act },
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

  const slotStart = entry?.offered_slot_start ? new Date(entry.offered_slot_start) : null

  // ── Screens ───────────────────────────────────────────────────────────────
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
        <h1 className="text-xl font-black mb-2" style={{ color: 'var(--color-text)' }}>קישור לא תקין</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>{errMsg}</p>
        <Link to="/" className="btn-primary justify-center">חזרה לדף הבית</Link>
      </Screen>
    )
  }

  if (phase === 'done') {
    const isBooked   = result?.action === 'booked'
    const isDeclined = result?.action === 'declined'
    const bookedSlot = result?.slotStart ? new Date(result.slotStart) : slotStart

    return (
      <Screen>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: isBooked ? 'var(--color-gold)' : 'rgba(107,114,128,0.2)' }}
        >
          <span className="text-3xl">{isBooked ? '✓' : '👍'}</span>
        </motion.div>

        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
          {isBooked ? 'התור נקבע בהצלחה!' : 'תודה על הממשוב'}
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          {isBooked && bookedSlot
            ? `${result?.serviceName ?? ''} · ${formatDateFull(bookedSlot)} בשעה ${formatTime(bookedSlot)}`
            : isDeclined
              ? 'מסרנו את מקומך לאדם הבא ברשימה'
              : ''}
        </p>

        {isBooked && (
          <Link to="/my-appointments" className="btn-primary justify-center text-sm py-3">
            הצג את התורים שלי ←
          </Link>
        )}
        {isDeclined && (
          <Link to="/" className="btn-ghost justify-center text-sm">
            חזרה לדף הבית
          </Link>
        )}
      </Screen>
    )
  }

  // phase === 'confirm' (no action param — show manual buttons)
  return (
    <Screen>
      <div className="text-5xl mb-4">🗓</div>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
        תור שהתפנה
      </h1>
      {slotStart && (
        <p className="text-base font-bold mb-1" style={{ color: 'var(--color-gold)' }}>
          {entry?.services?.name} · {formatDateFull(slotStart)} בשעה {formatTime(slotStart)}
        </p>
      )}
      <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
        שלום {entry?.profiles?.name}! האם תרצה לקבוע את התור הזה?
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
        <button
          onClick={() => handleAction('accept')}
          className="btn-primary justify-center text-base py-4"
        >
          ✅ כן, הזמן עבורי
        </button>
        <button
          onClick={() => handleAction('decline')}
          className="btn-ghost justify-center text-base py-3"
          style={{ color: 'var(--color-muted)' }}
        >
          ❌ לא, תודה
        </button>
      </div>
    </Screen>
  )
}

function Screen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-surface)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center p-8 rounded-3xl flex flex-col items-center"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}
      >
        {children}
      </motion.div>
    </div>
  )
}
