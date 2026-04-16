import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/Toast'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// ── Helpers ────────────────────────────────────────────────────────────────
function callEdgeFunction(name, body) {
  return supabase.functions.invoke(name, { body })
}

// ── Main Component ─────────────────────────────────────────────────────────
export function Messages() {
  const { user } = useAuth()
  const toast = useToast()

  // Filter
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'by_date'
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Recipients
  const [recipients, setRecipients] = useState([]) // [{id, name, phone, push_token}]
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  // Channels
  const [sendPush, setSendPush] = useState(true)
  const [sendWhatsapp, setSendWhatsapp] = useState(false)

  // Message
  const [messageTitle, setMessageTitle] = useState('')
  const [messageBody, setMessageBody] = useState('')

  // Sending
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState(null) // { pushSent, waSent, pushTotal, waTotal }

  // History
  const [logs, setLogs] = useState([])

  // Announcement
  const [annForm, setAnnForm] = useState({
    announcement_enabled: false,
    announcement_title: '',
    announcement_body: '',
    announcement_color: 'gold',
    announcement_expires_at: '',
  })
  const [annLoading, setAnnLoading] = useState(false)
  const [annSaving, setAnnSaving] = useState(false)

  // ── Load recipients ────────────────────────────────────────────────────
  useEffect(() => {
    loadRecipients()
  }, [filterTab, filterDate])

  useEffect(() => {
    loadLogs()
    loadAnnouncement()
  }, [])

  async function loadRecipients() {
    setLoadingRecipients(true)
    try {
      if (filterTab === 'all') {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, phone, push_token')
          .eq('role', 'customer')
          .order('name')
        setRecipients(data ?? [])
      } else {
        // Customers with appointment on filterDate
        const dayStart = `${filterDate}T00:00:00`
        const dayEnd   = `${filterDate}T23:59:59`
        const { data } = await supabase
          .from('appointments')
          .select('profiles(id, name, phone, push_token)')
          .gte('start_at', dayStart)
          .lte('start_at', dayEnd)
          .eq('status', 'confirmed')
          .not('customer_id', 'is', null)

        // De-duplicate by profile id
        const seen = new Set()
        const unique = []
        ;(data ?? []).forEach(a => {
          const p = a.profiles
          if (p && !seen.has(p.id)) { seen.add(p.id); unique.push(p) }
        })
        setRecipients(unique)
      }
    } finally {
      setLoadingRecipients(false)
    }
  }

  async function loadLogs() {
    const { data } = await supabase
      .from('message_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    setLogs(data ?? [])
  }

  // ── Computed stats ─────────────────────────────────────────────────────
  const pushRecipients = recipients.filter(r => r.push_token)
  const waRecipients   = recipients.filter(r => r.phone?.trim())

  const willSendPush = sendPush && pushRecipients.length > 0
  const willSendWa   = sendWhatsapp && waRecipients.length > 0

  const totalWillReceive = new Set([
    ...(willSendPush ? pushRecipients.map(r => r.id) : []),
    ...(willSendWa   ? waRecipients.map(r => r.id)   : []),
  ]).size

  // ── Announcement ──────────────────────────────────────────────────────
  async function loadAnnouncement() {
    setAnnLoading(true)
    const { data } = await supabase.from('business_settings').select('announcement_enabled,announcement_title,announcement_body,announcement_expires_at,announcement_color').eq('id', 1).single()
    if (data) setAnnForm({
      announcement_enabled: data.announcement_enabled ?? false,
      announcement_title: data.announcement_title ?? '',
      announcement_body: data.announcement_body ?? '',
      announcement_color: data.announcement_color ?? 'gold',
      announcement_expires_at: data.announcement_expires_at ?? '',
    })
    setAnnLoading(false)
  }

  async function saveAnnouncement() {
    setAnnSaving(true)
    await supabase.from('business_settings').update({
      announcement_enabled: annForm.announcement_enabled,
      announcement_title: annForm.announcement_title,
      announcement_body: annForm.announcement_body,
      announcement_color: annForm.announcement_color,
      announcement_expires_at: annForm.announcement_expires_at || null,
    }).eq('id', 1)
    toast({ message: 'ההודעה נשמרה', type: 'success' })
    setAnnSaving(false)
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!messageBody.trim()) { toast({ message: 'יש לכתוב הודעה', type: 'error' }); return }
    if (!willSendPush && !willSendWa) { toast({ message: 'אין נמענים לשליחה', type: 'error' }); return }
    setConfirmOpen(false)
    setSending(true)
    setLastResult(null)

    let pushSent = 0, pushTotal = 0, waSent = 0, waTotal = 0

    try {
      if (willSendPush) {
        pushTotal = pushRecipients.length
        const tokens = pushRecipients.map(r => r.push_token)
        const { data } = await callEdgeFunction('send-push', {
          title: messageTitle || 'הודעה מהמספרה',
          body: messageBody,
          tokens,
        })
        pushSent = data?.sent ?? 0
      }

      if (willSendWa) {
        waTotal = waRecipients.length
        const { data } = await callEdgeFunction('send-whatsapp', {
          recipients: waRecipients.map(r => ({ name: r.name, phone: r.phone })),
          message: messageBody,
        })
        waSent = data?.sent ?? 0
      }

      // Log
      const channel = willSendPush && willSendWa ? 'both' : willSendPush ? 'push' : 'whatsapp'
      await supabase.from('message_logs').insert({
        channel,
        message_text: messageBody,
        recipient_count: totalWillReceive,
        success_count: pushSent + waSent,
        filter_type: filterTab,
        filter_date: filterTab === 'by_date' ? filterDate : null,
        sent_by: user?.id,
      })

      setLastResult({ pushSent, waSent, pushTotal, waTotal })
      toast({ message: `✓ נשלח! Push: ${pushSent}/${pushTotal} · WhatsApp: ${waSent}/${waTotal}`, type: 'success' })
      setMessageBody('')
      setMessageTitle('')
      await loadLogs()
    } catch (err) {
      toast({ message: err.message || 'שגיאה בשליחה', type: 'error' })
    } finally {
      setSending(false)
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>📨 שליחת הודעות ללקוחות</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>שלח Push Notification או WhatsApp ללקוחות נבחרים</p>
      </div>

      {/* ── Announcement Popup ── */}
      <div className="card p-6" style={{ borderLeft: '4px solid var(--color-gold)' }}>
        <h2 className="font-bold text-base mb-0.5" style={{ color: 'var(--color-text)' }}>📢 הודעת פופאפ באפליקציה</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>הודעה שמופיעה אוטומטית ללקוח בכניסה לאפליקציה — לא נשלחת ב-WhatsApp</p>

        {annLoading ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>טוען...</p>
        ) : (
          <>
            <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <p className="font-medium text-sm">הפעל הודעת פופאפ</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>ייראה ללקוח כשנכנס לאפליקציה</p>
              </div>
              <button
                type="button"
                onClick={() => setAnnForm(f => ({ ...f, announcement_enabled: !f.announcement_enabled }))}
                className="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                style={{ background: annForm.announcement_enabled ? 'var(--color-gold)' : 'var(--color-border)' }}
              >
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: annForm.announcement_enabled ? '26px' : '2px' }} />
              </button>
            </div>

            {annForm.announcement_enabled && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">כותרת</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="למשל: שינוי בשעות פעילות"
                    value={annForm.announcement_title}
                    onChange={e => setAnnForm(f => ({ ...f, announcement_title: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">תוכן ההודעה</label>
                  <textarea
                    className="input min-h-[100px] resize-y"
                    placeholder="פרטי ההודעה..."
                    value={annForm.announcement_body}
                    onChange={e => setAnnForm(f => ({ ...f, announcement_body: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">צבע</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'gold', label: 'זהב', color: 'var(--color-gold)' },
                      { value: 'red',  label: 'אדום', color: '#ef4444' },
                      { value: 'blue', label: 'כחול', color: '#3b82f6' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAnnForm(f => ({ ...f, announcement_color: opt.value }))}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
                        style={{
                          borderColor: annForm.announcement_color === opt.value ? opt.color : 'var(--color-border)',
                          background: annForm.announcement_color === opt.value ? `${opt.color}22` : 'transparent',
                          color: annForm.announcement_color === opt.value ? opt.color : 'var(--color-muted)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">תפוגה (אופציונלי)</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={annForm.announcement_expires_at || ''}
                    onChange={e => setAnnForm(f => ({ ...f, announcement_expires_at: e.target.value || '' }))}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>אם לא תמלא — ההודעה תוצג ללא הגבלת זמן</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={saveAnnouncement}
              disabled={annSaving}
              className="btn-primary mt-4 text-sm px-6 py-2"
              style={{ opacity: annSaving ? 0.7 : 1 }}
            >
              {annSaving ? 'שומר...' : 'שמור הודעה'}
            </button>
          </>
        )}
      </div>

      {/* ── Send Messages Section ── */}
      <div>
        <h2 className="text-lg font-bold mb-0.5" style={{ color: 'var(--color-text)' }}>📤 שליחה ישירה ללקוחות (Push / WhatsApp)</h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>שולח הודעה ידנית לקבוצת לקוחות שבחרת</p>
      </div>

      {/* ── 1. Filter ── */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>1. מי יקבל את ההודעה?</h2>

        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-surface)' }}>
          {[
            { key: 'all', label: '👥 כל הלקוחות' },
            { key: 'by_date', label: '📅 לקוחות עם תור בתאריך' },
          ].map(tab => (
            <button key={tab.key} type="button"
              onClick={() => setFilterTab(tab.key)}
              className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
              style={{
                background: filterTab === tab.key ? 'var(--color-card)' : 'transparent',
                color: filterTab === tab.key ? 'var(--color-text)' : 'var(--color-muted)',
                boxShadow: filterTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >{tab.label}</button>
          ))}
        </div>

        {filterTab === 'by_date' && (
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="input" />
        )}

        {/* Recipient preview */}
        <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--color-surface)' }}>
          {loadingRecipients ? (
            <span style={{ color: 'var(--color-muted)' }}>טוען לקוחות...</span>
          ) : (
            <div className="space-y-1">
              <p className="font-bold" style={{ color: 'var(--color-text)' }}>
                📬 {recipients.length} לקוחות נמצאו
              </p>
              <p style={{ color: 'var(--color-muted)' }}>
                🔔 {pushRecipients.length} עם Push Notification ·
                📱 {waRecipients.length} עם WhatsApp
              </p>
              {recipients.length > 0 && (
                <p className="text-xs pt-1" style={{ color: 'var(--color-muted)' }}>
                  {recipients.slice(0, 5).map(r => r.name).join(', ')}
                  {recipients.length > 5 ? ` ועוד ${recipients.length - 5}...` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Channels ── */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>2. ערוץ שליחה</h2>
        <div className="space-y-2">
          {[
            {
              key: 'push', state: sendPush, set: setSendPush,
              label: '🔔 Push Notification',
              desc: `${pushRecipients.length} לקוחות נרשמו להתראות`,
              note: pushRecipients.length === 0 ? 'אין לקוחות עם הרשאת Push' : null,
            },
            {
              key: 'wa', state: sendWhatsapp, set: setSendWhatsapp,
              label: '📱 WhatsApp (Twilio)',
              desc: `${waRecipients.length} לקוחות עם מספר טלפון`,
              note: waRecipients.length === 0 ? 'אין לקוחות עם מספר טלפון' : null,
            },
          ].map(ch => (
            <label key={ch.key} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
              style={{ border: `2px solid ${ch.state ? 'var(--color-gold)' : 'var(--color-border)'}`, background: ch.state ? 'rgba(201,169,110,0.06)' : 'transparent' }}>
              <input type="checkbox" className="sr-only" checked={ch.state} onChange={e => ch.set(e.target.checked)} />
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                style={{ background: ch.state ? 'var(--color-gold)' : 'var(--color-border)', border: ch.state ? 'none' : '2px solid var(--color-border)' }}>
                {ch.state && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{ch.label}</p>
                <p className="text-xs" style={{ color: ch.note ? '#f59e0b' : 'var(--color-muted)' }}>
                  {ch.note || ch.desc}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── 3. Message ── */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>3. כתוב את ההודעה</h2>

        {sendPush && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>כותרת (Push בלבד)</label>
            <input className="input" placeholder="הודעה מהמספרה"
              value={messageTitle} onChange={e => setMessageTitle(e.target.value)} />
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>גוף ההודעה *</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => setMessageBody(b => b + '{שם}')}
                className="text-xs px-2 py-0.5 rounded-lg border font-medium transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                + &#123;שם&#125;
              </button>
            </div>
          </div>
          <textarea
            className="input resize-none h-28"
            placeholder="כתוב את ההודעה כאן... השתמש ב-{שם} לשם הלקוח האישי"
            value={messageBody}
            onChange={e => setMessageBody(e.target.value)}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{messageBody.length} תווים</p>
        </div>

        {/* Preview */}
        {messageBody && (
          <div className="space-y-3">
            <p className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>תצוגה מקדימה:</p>

            {sendPush && (
              <div className="rounded-xl p-3 text-right" style={{ background: '#1c1c1e' }}>
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">✂</div>
                  <div>
                    <p className="text-white text-xs font-bold">{messageTitle || 'הודעה מהמספרה'}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{messageBody.replace(/\{שם\}/g, 'ישראל')}</p>
                  </div>
                </div>
              </div>
            )}

            {sendWhatsapp && (
              <div className="rounded-xl p-3" style={{ background: '#0b1b10' }}>
                <div className="max-w-[80%] mr-auto rounded-xl p-3 text-right"
                  style={{ background: '#005c4b' }}>
                  <p className="text-white text-sm">{messageBody.replace(/\{שם\}/g, 'ישראל')}</p>
                  <p className="text-green-400 text-xs mt-1">✓✓ {format(new Date(), 'HH:mm')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Send ── */}
      <div className="space-y-3">
        {lastResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <p className="font-bold mb-1" style={{ color: '#16a34a' }}>✓ נשלח בהצלחה!</p>
            {lastResult.pushTotal > 0 && (
              <p style={{ color: 'var(--color-muted)' }}>🔔 Push: {lastResult.pushSent} מתוך {lastResult.pushTotal}</p>
            )}
            {lastResult.waTotal > 0 && (
              <p style={{ color: 'var(--color-muted)' }}>📱 WhatsApp: {lastResult.waSent} מתוך {lastResult.waTotal}</p>
            )}
          </motion.div>
        )}

        <button
          onClick={() => {
            if (!messageBody.trim()) { toast({ message: 'יש לכתוב הודעה', type: 'error' }); return }
            if (!willSendPush && !willSendWa) { toast({ message: 'יש לבחור ערוץ שליחה עם נמענים', type: 'error' }); return }
            setConfirmOpen(true)
          }}
          disabled={sending}
          className="btn-primary w-full justify-center text-base py-4"
          style={{ opacity: sending ? 0.7 : 1 }}
        >
          {sending ? '⏳ שולח...' : `📤 שלח הודעה ל-${totalWillReceive} לקוחות`}
        </button>
      </div>

      {/* ── Confirm Dialog ── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-6 max-w-sm w-full text-right"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
          >
            <h3 className="text-lg font-black mb-2" style={{ color: 'var(--color-text)' }}>אישור שליחה</h3>
            <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
              עומד לשלוח ל-<strong>{totalWillReceive}</strong> לקוחות:
            </p>
            {willSendPush && <p className="text-sm" style={{ color: 'var(--color-muted)' }}>🔔 Push Notification: {pushRecipients.length} נמענים</p>}
            {willSendWa   && <p className="text-sm" style={{ color: 'var(--color-muted)' }}>📱 WhatsApp: {waRecipients.length} נמענים</p>}
            <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'var(--color-surface)' }}>
              <p className="font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>{messageTitle || 'הודעה מהמספרה'}</p>
              <p style={{ color: 'var(--color-muted)' }}>{messageBody}</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSend} className="btn-primary flex-1 justify-center">
                ✓ כן, שלח
              </button>
              <button onClick={() => setConfirmOpen(false)} className="btn-outline flex-1 justify-center">
                ביטול
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── History ── */}
      {logs.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--color-text)' }}>היסטוריית שליחות</h2>
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl text-sm" style={{ background: 'var(--color-surface)' }}>
                <span className="text-lg flex-shrink-0">
                  {log.channel === 'push' ? '🔔' : log.channel === 'whatsapp' ? '📱' : '📨'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{log.message_text}</p>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {new Date(log.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-left flex-shrink-0">
                  <p className="font-bold" style={{ color: log.success_count === log.recipient_count ? '#16a34a' : '#f59e0b' }}>
                    {log.success_count}/{log.recipient_count}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>נשלחו</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
