import { Link } from 'react-router-dom'
import { formatTime } from '../../../lib/utils'

/**
 * Thin list of the next N appointments (default 3).
 * Clicking a row navigates to Appointments.jsx for full actions.
 */
export function UpcomingAppointmentsList({ appointments = [], limit = 3 }) {
  if (!appointments.length) return null
  const next = appointments.slice(0, limit)

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          ⏭️ {limit} התורים הבאים
        </h2>
        <Link to="/admin/appointments"
          className="text-xs font-bold"
          style={{ color: 'var(--color-gold)' }}>
          כל היומן ←
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {next.map(apt => {
          const paidBadge = apt.payment_status === 'paid'
          return (
            <Link to="/admin/appointments" key={apt.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all active:scale-[0.98]"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              <div className="w-12 text-center py-1 rounded-lg text-xs font-black flex-shrink-0"
                style={{ background: 'var(--color-surface)', color: 'var(--color-gold)', border: '1px solid var(--color-border)' }}>
                {formatTime(apt.start_at)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>
                  {apt.profiles?.name || '—'}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
                  {apt.services?.name} · {apt.staff?.name}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {paidBadge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>
                    ✓ שולם
                  </span>
                )}
                <span className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                  ₪{Number(apt.services?.price || 0).toLocaleString('he-IL')}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
