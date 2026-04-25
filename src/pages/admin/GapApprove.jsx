import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../lib/utils'

export function GapApprove() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()

  const [phase, setPhase] = useState('loading') // loading | confirm | processing | done | error
  const [offer, setOffer] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const [done, setDone] = useState(null) // 'approved' | 'cancelled' | 'waitlist'

  useEffect(() => {
    if (!token) { setPhase('error'); setErrMsg('חסר טוקן'); return }

    supabase
      .from('reschedule_offers')
      .select('*, appointments(id, start_at, end_at, service_id, branch_id, services(name), staff(name), profiles(name, phone, push_token))')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); setErrMsg('קישור לא תקין'); return }
        if (data.status === 'accepted') { setDone('approved'); setPhase('done'); return }
        if (data.status === 'declined') { setDone('cancelled'); setPhase('done'); return }
        if (data.status !== 'pending_owner_approval') {
          setPhase('error'); setErrMsg('ההצעה כבר לא בהמתנה לאישור'); return
        }
        if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
          setPhase('error'); setErrMsg('ההצעה פגה'); return
        }
        setOffer(data)
        setPhase('confirm')
      })
  }, [token])

  async function handleApprove() {
    setPhase('processing')
    try {
      const appt = offer.appointments

      // Step 1: try waitlist first
      try {
        const { data: wl } = await supabase.functions.invoke('notify-waitlist', {
          body: {
            serviceId: appt?.service_id,
            branchId:  appt?.branch_id ?? null,
            staffId:   offer.staff_id  ?? null,
            slotStart: offer.offered_start_at,
            slotEnd:   offer.offered_end_at,
          },
        })
        if ((wl?.notified ?? 0) > 0) {
          // Waitlist gets the slot — cancel this reschedule offer
          await supabase.from('reschedule_offers')
            .update({ status: 'declined', responded_at: new Date().toISOString() })
            .eq('token', token)
          setDone('waitlist')
          setPhase('done')
          return
        }
      } catch {
        // If notify-waitlist fails, fall through to customer offer
      }

      // Step 2: no waitlist — send reschedule offer to existing customer
      const { error: updateErr } = await supabase
        .from('reschedule_offers')
        .update({
          status: 'pending',
          token_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        })
        .eq('token', token)
      if (updateErr) throw updateErr

      const { data: biz } = await supabase
        .from('business_settings')
        .select('gap_closer_notification_channel')
        .single()
      const channel = biz?.gap_closer_notification_channel || 'push'

      const APP_URL = window.location.origin
      const confirmUrl = `${APP_URL}/reschedule/confirm?token=${token}`
      const customerName = appt?.profiles?.name || 'לקוח'
      const newStart = new Date(offer.offered_start_at)
      const oldStart = new Date(offer.original_start_at || appt?.start_at)

      if (channel === 'whatsapp') {
        const phone = appt?.profiles?.phone
        if (phone) {
          const message =
            `היי ${customerName}! 🙋‍♂️\n` +
            `יש אפשרות להקדים את התור שלך ל-${formatTime(newStart)} (במקום ${formatTime(oldStart)}).\n` +
            `אישור: ${confirmUrl}&action=accept\n` +
            `לא מתאים: ${confirmUrl}&action=decline`
          await supabase.functions.invoke('send-whatsapp', {
            body: { recipients: [{ name: customerName, phone }], message },
          })
        }
      } else {
        const pushToken = appt?.profiles?.push_token
        if (pushToken) {
          const serviceName = appt?.services?.name || ''
          const dateStr = new Date(offer.offered_start_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
          await supabase.functions.invoke('send-push', {
            body: {
              title: '📅 אפשרות להקדים את התור!',
              body: `${serviceName} ב-${dateStr} — ${formatTime(newStart)} במקום ${formatTime(oldStart)}. לחץ לאישור ↓`,
              tokens: [pushToken],
              url: confirmUrl,
            },
          })
        }
      }

      await supabase.from('reschedule_offers').update({ notification_sent: true }).eq('token', token)
      setDone('approved')
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrMsg(err.message ?? 'שגיאה')
    }
  }

  async function handleCancel() {
    setPhase('processing')
    try {
      await supabase
        .from('reschedule_offers')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('token', token)
      setDone('cancelled')
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrMsg(err.message ?? 'שגיאה')
    }
  }

  if (phase === 'loading' || phase === 'processing') {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
        <div className="text-4xl">❌</div>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{errMsg}</p>
        <button
          onClick={() => navigate('/admin/appointments')}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white mt-2"
          style={{ background: 'var(--color-gold)' }}
        >
          חזרה ליומן
        </button>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
        <div className="text-4xl">{done === 'approved' ? '✅' : '❌'}</div>
        <p className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>
          {done === 'approved' ? 'ההצעה נשלחה ללקוח!' : done === 'waitlist' ? 'רשימת המתנה הופעלה!' : 'ההצעה בוטלה'}
        </p>
        {done === 'waitlist' && (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            לקוח מרשימת ההמתנה קיבל הודעה. אם אף אחד לא אישר — חזור ושלח ידנית.
          </p>
        )}
        <button
          onClick={() => navigate('/admin/appointments')}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white mt-2"
          style={{ background: 'var(--color-gold)' }}
        >
          חזרה ליומן
        </button>
      </div>
    )
  }

  const offeredStart = new Date(offer.offered_start_at)
  const originalStart = new Date(offer.original_start_at || offer.appointments?.start_at)
  const customerName = offer.appointments?.profiles?.name || 'לקוח'
  const serviceName = offer.appointments?.services?.name
  const staffName = offer.appointments?.staff?.name

  return (
    <div className="max-w-sm mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">⚡</div>
          <h1 className="font-black text-lg" style={{ color: 'var(--color-text)' }}>
            חור ביומן — נדרש אישור
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {customerName}
            {serviceName && ` — ${serviceName}`}
            {staffName && ` (${staffName})`}
          </p>
        </div>

        <div
          className="rounded-xl p-4 mb-5 flex items-center justify-center gap-6"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-center">
            <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>שעה נוכחית</p>
            <p className="font-bold text-xl line-through opacity-60" style={{ color: 'var(--color-text)' }}>
              {formatTime(originalStart)}
            </p>
          </div>
          <div className="text-xl" style={{ color: 'var(--color-gold)' }}>→</div>
          <div className="text-center">
            <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>שעה חדשה</p>
            <p className="font-black text-xl" style={{ color: 'var(--color-gold)' }}>
              {formatTime(offeredStart)}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            className="flex-1 py-3 rounded-xl text-white font-bold text-sm"
            style={{ background: 'var(--color-gold)' }}
          >
            ✅ שלח הצעה ללקוח
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            ❌ בטל
          </button>
        </div>
      </motion.div>
    </div>
  )
}
