import { Link } from 'react-router-dom'
import { formatTime, formatDate } from '../../../lib/utils'
import { docLabel } from '../../../lib/finance'

/**
 * "Action inbox" — items that need the shop owner's attention.
 *
 * Props:
 *   uninvoiced: [appointment]   — completed + invoice_sent=false
 *   openDebts:  [debt]           — status=pending (with profiles joined)
 *   debtsTotal: number
 *   waitlist:   [entry]          — active pending (already filtered)
 *   onScheduleWaitlist:(entry)=>void
 */
export function ActionInbox({ uninvoiced = [], openDebts = [], debtsTotal = 0, waitlist = [], onScheduleWaitlist, businessType }) {
  const hasAny = uninvoiced.length > 0 || openDebts.length > 0 || waitlist.length > 0
  if (!hasAny) {
    return (
      <section className="rounded-2xl p-5 mb-5 text-center"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="text-3xl mb-1">✨</div>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>הכל מטופל</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
          אין חשבוניות, חובות, או ממתינים שדורשים טיפול
        </p>
      </section>
    )
  }

  return (
    <section className="mb-5">
      <h2 className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
        🔔 דורש טיפול
      </h2>

      <div className="flex flex-col gap-3">
        {/* Uninvoiced appointments */}
        {uninvoiced.length > 0 && (
          <InboxCard
            to="/admin/quick-settle"
            icon="⚡"
            color="#f59e0b"
            title={`${uninvoiced.length} תורים ממתינים לסגירה`}
            subtitle={`לחץ לסגירה מהירה — ${docLabel(businessType, true)} + סטטוס`}
            bg="rgba(245,158,11,0.08)"
            border="rgba(245,158,11,0.3)"
          >
            <div className="flex flex-col gap-1 mt-2">
              {uninvoiced.slice(0, 3).map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs"
                  style={{ color: 'var(--color-text)' }}>
                  <span className="truncate">
                    {formatDate(a.start_at)} · {a.profiles?.name || '—'}
                  </span>
                  <span className="font-bold">₪{Number(a.services?.price || 0).toLocaleString('he-IL')}</span>
                </div>
              ))}
              {uninvoiced.length > 3 && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>
                  +{uninvoiced.length - 3} נוספים
                </div>
              )}
            </div>
          </InboxCard>
        )}

        {/* Open debts */}
        {openDebts.length > 0 && (
          <InboxCard
            to="/admin/finance"
            state={{ tab: 'debts' }}
            icon="💳"
            color="#dc2626"
            title={`${openDebts.length} חובות פתוחים`}
            subtitle="לחץ לעבור לטאב חובות"
            bg="rgba(239,68,68,0.08)"
            border="rgba(239,68,68,0.3)"
            trailing={
              <div className="text-left">
                <div className="text-lg font-black" style={{ color: '#dc2626' }}>
                  ₪{Number(debtsTotal).toLocaleString('he-IL')}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>סה"כ</div>
              </div>
            }
          >
            <div className="flex flex-col gap-1 mt-2">
              {openDebts.slice(0, 3).map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs"
                  style={{ color: 'var(--color-text)' }}>
                  <span className="truncate">
                    {d.profiles?.name || '—'} · {formatDate(d.created_at)}
                  </span>
                  <span className="font-bold">₪{Number(d.amount).toLocaleString('he-IL')}</span>
                </div>
              ))}
              {openDebts.length > 3 && (
                <div className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>
                  +{openDebts.length - 3} נוספים
                </div>
              )}
            </div>
          </InboxCard>
        )}

        {/* Waitlist */}
        {waitlist.length > 0 && (
          <div className="rounded-2xl p-3"
            style={{ background: 'rgba(255,122,0,0.06)', border: '1px solid rgba(255,122,0,0.25)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏳</span>
                <div>
                  <div className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                    {waitlist.length} ממתינים לתור
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    לחץ על "שיבוץ" לשבץ מייד
                  </div>
                </div>
              </div>
              <Link to="/admin/waitlist" className="text-[11px] font-bold"
                style={{ color: 'var(--color-gold)' }}>
                הכל ←
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {waitlist.slice(0, 4).map(e => {
                const dateStr = e.preferred_date
                  ? formatDate(e.preferred_date + 'T12:00:00')
                  : '—'
                const timeStr = `${e.time_from?.slice(0, 5) || ''}–${e.time_to?.slice(0, 5) || ''}`
                return (
                  <div key={e.id} className="flex items-center justify-between rounded-xl px-2.5 py-2 text-xs"
                    style={{ background: 'var(--color-card)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        {e.profiles?.name || '—'}
                      </div>
                      <div className="truncate" style={{ color: 'var(--color-muted)' }}>
                        {dateStr} · {timeStr}
                      </div>
                    </div>
                    <button onClick={() => onScheduleWaitlist?.(e)}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ml-2"
                      style={{ background: 'var(--color-gold)', color: '#fff' }}>
                      שיבוץ
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* Internal reusable card with clickable wrapper */
function InboxCard({ to, state, icon, color, title, subtitle, bg, border, trailing, children }) {
  return (
    <Link to={to} state={state}
      className="block rounded-2xl p-3 transition-all active:scale-[0.99]"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xl">{icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-black truncate" style={{ color }}>
              {title}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {subtitle}
            </div>
          </div>
        </div>
        {trailing || <span className="text-lg flex-shrink-0 ml-2" style={{ color }}>←</span>}
      </div>
      {children}
    </Link>
  )
}
