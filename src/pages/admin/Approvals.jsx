import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { formatDateFull, formatTime } from '../../lib/utils'

export function Approvals() {
  const qc = useQueryClient()
  const toast = useToast()
  const [busyId, setBusyId] = useState(null)
  const [moveAppt, setMoveAppt] = useState(null)
  const [moveDate, setMoveDate] = useState('')
  const [moveTime, setMoveTime] = useState('')
  const [msgAppt, setMsgAppt] = useState(null)
  const [msgText, setMsgText] = useState('')

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['appointments', 'pending-approval', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, start_at, end_at, created_at, customer_id, staff_id, service_id, branch_id,
          profiles ( id, name, phone, push_token ),
          services ( id, name, duration_minutes, price ),
          staff    ( id, name )
        `)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // realtime
  useEffect(() => {
    const ch = supabase.channel(`approvals-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' },
        () => qc.invalidateQueries({ queryKey: ['appointments'] }))
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch {} }
  }, [qc])

  function timeAgo(iso) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 1) return 'כרגע'
    if (min < 60) return `לפני ${min} דק׳`
    const h = Math.floor(min / 60)
    if (h < 24) return `לפני ${h} שע׳`
    return `לפני ${Math.floor(h / 24)} ימים`
  }

  function pushToCustomer(appt, title, body, url = '/my-appointments') {
    const token = appt.profiles?.push_token
    if (!token) return
    return supabase.functions.invoke('send-push', {
      body: { title, body, tokens: [token], url },
    }).catch(() => {})
  }

  async function approve(appt) {
    setBusyId(appt.id)
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appt.id)
      if (error) throw error
      const start = new Date(appt.start_at)
      const dateStr = start.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
      const timeStr = formatTime(start)
      await pushToCustomer(
        appt,
        '✅ התור שלך אושר!',
        `${appt.services?.name || 'התור'} ב-${dateStr} בשעה ${timeStr}. נשמח לראותך!`,
      )
      toast({ message: 'התור אושר', type: 'success' })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally { setBusyId(null) }
  }

  async function decline(appt) {
    if (!window.confirm(`לדחות את הבקשה של ${appt.profiles?.name || 'הלקוח'}?`)) return
    setBusyId(appt.id)
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancelled_by: 'admin', cancellation_reason: 'לא אושר ע"י בעל העסק' })
        .eq('id', appt.id)
      if (error) throw error
      await pushToCustomer(
        appt,
        '❌ התור לא אושר',
        'מצטערים, לא נוכל לאשר את התור המבוקש. אפשר לקבוע מועד אחר או ליצור קשר עם המספרה.',
      )
      toast({ message: 'התור נדחה ולקוח קיבל הודעה', type: 'success' })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally { setBusyId(null) }
  }

  function openMove(appt) {
    const d = new Date(appt.start_at)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    setMoveDate(`${yyyy}-${mm}-${dd}`)
    setMoveTime(`${hh}:${mi}`)
    setMoveAppt(appt)
  }

  async function submitMove() {
    if (!moveAppt || !moveDate || !moveTime) return
    const appt = moveAppt
    setBusyId(appt.id)
    try {
      const newStart = new Date(`${moveDate}T${moveTime}:00`)
      const duration = appt.services?.duration_minutes
        || ((new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()) / 60000)
      const newEnd = new Date(newStart.getTime() + duration * 60000)

      // Conflict check with same staff
      if (appt.staff_id) {
        const { data: conflicts } = await supabase
          .from('appointments')
          .select('id')
          .eq('staff_id', appt.staff_id)
          .neq('status', 'cancelled')
          .neq('id', appt.id)
          .lt('start_at', newEnd.toISOString())
          .gt('end_at',   newStart.toISOString())
          .limit(1)
        if (conflicts && conflicts.length > 0) {
          toast({ message: 'השעה החדשה תפוסה אצל הספר', type: 'error' })
          setBusyId(null)
          return
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          start_at: newStart.toISOString(),
          end_at:   newEnd.toISOString(),
          status:   'confirmed',
        })
        .eq('id', appt.id)
      if (error) throw error

      const oldStart = new Date(appt.start_at)
      await pushToCustomer(
        appt,
        '📅 התור שלך נקבע למועד חדש',
        `במקום ${formatTime(oldStart)} ב-${oldStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} — ` +
        `נקבע ל-${formatTime(newStart)} ב-${newStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}. ` +
        `אם לא מתאים — אפשר לבטל בדף "התורים שלי".`,
      )
      toast({ message: 'התור הוזז ולקוח קיבל הודעה', type: 'success' })
      setMoveAppt(null)
      qc.invalidateQueries({ queryKey: ['appointments'] })
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally { setBusyId(null) }
  }

  function openMessage(appt) {
    setMsgText('')
    setMsgAppt(appt)
  }

  async function sendMessage() {
    if (!msgAppt || !msgText.trim()) return
    const appt = msgAppt
    setBusyId(appt.id)
    try {
      // WhatsApp
      const phone = appt.profiles?.phone?.replace(/\D/g, '')
      const wa = phone?.startsWith('0') ? `972${phone.slice(1)}` : phone
      if (wa) {
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msgText)}`, '_blank')
      }
      // Push as well (best effort)
      await pushToCustomer(appt, '💬 הודעה מהמספרה', msgText)
      toast({ message: 'נפתח WhatsApp', type: 'success' })
      setMsgAppt(null)
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally { setBusyId(null) }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>⏳ אישור תורים</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {pending.length === 0 ? 'אין תורים שממתינים לאישור' : `${pending.length} תורים ממתינים לאישור שלך`}
          </p>
        </div>
        <Link to="/admin" className="btn-ghost text-sm">← לוח בקרה</Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-5xl mb-3">✅</div>
          <p className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>הכל מאושר!</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>אין תורים שממתינים לאישור כרגע.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(appt => {
            const start = new Date(appt.start_at)
            const isBusy = busyId === appt.id
            return (
              <div key={appt.id} className="rounded-2xl p-4"
                style={{ background: 'var(--color-card)', border: '1.5px solid rgba(245,158,11,0.35)', boxShadow: 'var(--shadow-card)' }}>

                {/* Header row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{ background: '#f59e0b', color: '#fff' }}>
                    {appt.profiles?.name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-base truncate" style={{ color: 'var(--color-text)' }}>
                      {appt.profiles?.name || 'לקוח'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {appt.profiles?.phone} · {timeAgo(appt.created_at)}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>
                    ⏳ ממתין
                  </span>
                </div>

                {/* Details */}
                <div className="rounded-xl p-3 mb-3 text-sm space-y-1"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="flex justify-between"><span style={{ color: 'var(--color-muted)' }}>שירות</span><span className="font-bold">{appt.services?.name || '—'}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--color-muted)' }}>ספר</span><span className="font-bold">{appt.staff?.name || '—'}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--color-muted)' }}>תאריך</span><span className="font-bold">{formatDateFull(start)}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--color-muted)' }}>שעה</span><span className="font-bold">{formatTime(start)}</span></div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isBusy}
                    onClick={() => approve(appt)}
                    className="py-2.5 rounded-xl text-sm font-black active:scale-95 transition-all"
                    style={{ background: '#16a34a', color: '#fff', opacity: isBusy ? 0.6 : 1 }}>
                    ✅ אשר
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => openMove(appt)}
                    className="py-2.5 rounded-xl text-sm font-black active:scale-95 transition-all"
                    style={{ background: 'var(--color-gold)', color: '#fff', opacity: isBusy ? 0.6 : 1 }}>
                    📅 הצע מועד אחר
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => openMessage(appt)}
                    className="py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                    💬 שלח הודעה
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => decline(appt)}
                    className="py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)' }}>
                    ❌ דחה
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Move modal */}
      <Modal open={!!moveAppt} onClose={() => setMoveAppt(null)} title="📅 הצע מועד אחר">
        {moveAppt && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {moveAppt.profiles?.name} · {moveAppt.services?.name}
            </p>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-muted)' }}>תאריך</label>
              <input type="date" className="input w-full" value={moveDate} onChange={e => setMoveDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-muted)' }}>שעה</label>
              <input type="time" className="input w-full" value={moveTime} onChange={e => setMoveTime(e.target.value)} />
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              התור יקבע למועד החדש ויאושר. הלקוח יקבל התראה ויוכל לבטל אם לא מתאים.
            </p>
            <button
              onClick={submitMove}
              disabled={busyId === moveAppt.id || !moveDate || !moveTime}
              className="btn-primary w-full justify-center py-3">
              {busyId === moveAppt.id ? 'שולח...' : 'אשר ושלח ללקוח'}
            </button>
          </div>
        )}
      </Modal>

      {/* Message modal */}
      <Modal open={!!msgAppt} onClose={() => setMsgAppt(null)} title="💬 שלח הודעה ללקוח">
        {msgAppt && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{msgAppt.profiles?.name} · {msgAppt.profiles?.phone}</p>
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder="היי! לגבי התור שלך..."
              rows={4}
              className="input w-full"
              style={{ resize: 'vertical' }}
            />
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              ייפתח חלון WhatsApp עם ההודעה. ההודעה תישלח גם כ-Push (אם הותקנה אפליקציה).
            </p>
            <button
              onClick={sendMessage}
              disabled={!msgText.trim() || busyId === msgAppt.id}
              className="btn-primary w-full justify-center py-3">
              📤 שלח
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
