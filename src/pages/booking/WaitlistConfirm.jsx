import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import { formatDateFull, formatTime } from '../../lib/utils'

export function WaitlistConfirm() {
  const [params] = useSearchParams()
  const token    = params.get('token')
  const action   = params.get('action')

  const [phase,  setPhase]  = useState('loading')
  const [entry,  setEntry]  = useState(null)
  const [result, setResult] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!token) { setPhase('error'); setErrMsg('קישור לא תקין — חסר טוקן'); return }

    supabase
      .from('waitlist')
      .select('*, services(name), staff:offered_staff_id(name)')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); setErrMsg('קישור לא תקין'); return }
        if (data.status === 'booked')   { setPhase('done'); setResult({ action: 'booked',   slotStart: data.offered_slot_start, serviceName: data.services?.name }); return }
        if (data.status === 'declined') { setPhase('done'); setResult({ action: 'declined' }); return }
        if (data.status !== 'notified') { setPhase('error'); setErrMsg('ההצעה כבר לא פעילה'); return }
        if (new Date(data.token_expires_at) < new Date()) { setPhase('error'); setErrMsg('ההצעה פגה — הזמן עבר'); return }
        setEntry(data)
        setPhase('confirm')
      })
  }, [token])

  useEffect(() => {
    if (phase === 'confirm' && action && entry) handleAction(action)
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

  const slotStart   = entry?.offered_slot_start ? new Date(entry.offered_slot_start) : null
  const serviceName = entry?.services?.name ?? ''
  const staffName   = entry?.staff?.name ?? ''

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--color-surface)' }}>
      <AnimatePresence mode="wait">
        {(phase === 'loading' || phase === 'processing') && (
          <motion.div key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-sm" style={{ color: 'var(--color-muted)' }}>
              {phase === 'processing' ? 'מעבד...' : 'טוען...'}
            </p>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="text-center w-full max-w-sm">
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-xl font-black mb-2" style={{ color: 'var(--color-text)' }}>שגיאה</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>{errMsg}</p>
            <Link to="/" className="btn-primary px-6 py-2.5 text-sm">חזרה לדף הבית</Link>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div key="done"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="text-center w-full max-w-sm">
            <div className="text-5xl mb-4">
              {result?.action === 'booked' ? '✅' : '👋'}
            </div>
            <h1 className="text-xl font-black mb-2" style={{ color: 'var(--color-text)' }}>
              {result?.action === 'booked' ? 'התור נקבע בהצלחה!' : 'ביטלת את ההצעה'}
            </h1>
            {result?.action === 'booked' && result.slotStart && (
              <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
                {result.serviceName && <span>{result.serviceName} — </span>}
                {formatTime(new Date(result.slotStart))}
              </p>
            )}
            {result?.action !== 'booked' && (
              <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
                נמשיך לחפש תור מתאים עבורך
              </p>
            )}
            <Link to="/" className="btn-primary px-6 py-2.5 text-sm mt-6 inline-block">חזרה לדף הבית</Link>
          </motion.div>
        )}

        {phase === 'confirm' && entry && (
          <motion.div key="confirm"
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="w-full max-w-sm"
          >
            <div className="rounded-3xl overflow-hidden"
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
              }}>

              {/* Header */}
              <div className="px-6 pt-7 pb-5 text-center"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="text-4xl mb-3">🗓</div>
                <h1 className="text-lg font-black" style={{ color: 'var(--color-text)' }}>
                  התפנה תור!
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                  יש מקום פנוי שמתאים לך
                </p>
              </div>

              {/* Slot info */}
              <div className="px-6 py-5">
                <div className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  {serviceName && (
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-muted)' }}>
                      {serviceName}{staffName ? ` עם ${staffName}` : ''}
                    </p>
                  )}
                  {slotStart && (
                    <>
                      <p className="text-2xl font-black" style={{ color: 'var(--color-gold)' }}>
                        {formatTime(slotStart)}
                      </p>
                      <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                        {formatDateFull(slotStart)}
                      </p>
                    </>
                  )}
                </div>
                <p className="text-xs text-center mt-3" style={{ color: 'var(--color-muted)' }}>
                  ⏰ ההצעה בתוקף ל-30 דקות בלבד
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex flex-col gap-3">
                <button
                  onClick={() => handleAction('accept')}
                  className="w-full py-4 rounded-2xl text-white font-black text-base transition-all active:scale-95"
                  style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                  ✅ כן, הזמן עבורי
                </button>
                <button
                  onClick={() => handleAction('decline')}
                  className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
                  לא, תודה
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
