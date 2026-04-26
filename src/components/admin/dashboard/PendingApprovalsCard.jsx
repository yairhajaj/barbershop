import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDateFull, formatTime } from '../../../lib/utils'

/**
 * Card הצגת תורים שממתינים לאישור בעל העסק.
 * מוצג רק כשapproval_required מופעל בהגדרות.
 */
export function PendingApprovalsCard() {
  const { data: pending = [] } = useQuery({
    queryKey: ['appointments', 'pending-approval'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, start_at, end_at, created_at,
          profiles ( name, phone ),
          services ( name ),
          staff    ( name )
        `)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  if (pending.length === 0) return null

  const next = pending[0]
  const start = next ? new Date(next.start_at) : null

  return (
    <Link
      to="/admin/approvals"
      className="block rounded-2xl p-4 mb-4 transition-all active:scale-[0.99]"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(245,158,11,0.04))',
        border: '1.5px solid rgba(245,158,11,0.45)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#f59e0b', color: '#fff' }}
          >
            ⏳ ממתינים לאישור
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
            {pending.length} {pending.length === 1 ? 'בקשה' : 'בקשות'}
          </span>
        </div>
        <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>
          לדף האישורים ←
        </span>
      </div>

      {next && (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
            style={{ background: '#f59e0b', color: '#fff' }}
          >
            {next.profiles?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm truncate" style={{ color: 'var(--color-text)' }}>
              {next.profiles?.name || 'לקוח'}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
              {next.services?.name} · {next.staff?.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {start ? `${formatDateFull(start)} · ${formatTime(start)}` : ''}
            </div>
          </div>
        </div>
      )}
    </Link>
  )
}
