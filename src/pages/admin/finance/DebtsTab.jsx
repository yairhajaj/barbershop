import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Spinner } from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ui/Toast'
import { formatDate } from '../../../lib/utils'

export function DebtsTab() {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  async function fetchDebts() {
    setLoading(true)
    const { data } = await supabase
      .from('customer_debts')
      .select('*, profiles:customer_id(id, name, phone, is_blocked)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setDebts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchDebts() }, [])

  async function handleMarkPaid(debt) {
    const { error } = await supabase
      .from('customer_debts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', debt.id)
    if (error) { toast({ message: 'שגיאה', type: 'error' }); return }
    toast({ message: 'חוב סומן כשולם ✓', type: 'success' })
    fetchDebts()
  }

  async function handleDelete(debt) {
    if (!confirm(`למחוק חוב של ${debt.profiles?.name}?`)) return
    const { error } = await supabase.from('customer_debts').delete().eq('id', debt.id)
    if (error) { toast({ message: 'שגיאה', type: 'error' }); return }
    toast({ message: 'חוב נמחק', type: 'success' })
    fetchDebts()
  }

  async function handleUnblock(profileId, debtId) {
    await supabase.from('profiles').update({ is_blocked: false }).eq('id', profileId)
    await supabase.from('customer_debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', debtId)
    toast({ message: 'לקוח שוחרר מחסימה ✓', type: 'success' })
    fetchDebts()
  }

  const total = debts.reduce((s, d) => s + (Number(d.amount) || 0), 0)

  return (
    <div>
      {/* Summary */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>חובות פתוחים</p>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-black" style={{ color: 'var(--color-gold)' }}>₪{total.toLocaleString('he-IL')}</span>
          <span className="text-sm pb-1" style={{ color: 'var(--color-muted)' }}>{debts.length} חובות</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : debts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          <div className="text-5xl mb-3">✅</div>
          <p className="font-medium">אין חובות פתוחים</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {debts.map(debt => (
            <div
              key={debt.id}
              className="rounded-2xl p-4"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{debt.profiles?.name || '—'}</span>
                    {debt.profiles?.is_blocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>חסום</span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{debt.profiles?.phone}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{debt.description} · {formatDate(debt.created_at)}</p>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-black text-lg" style={{ color: '#d97706' }}>₪{Number(debt.amount).toLocaleString('he-IL')}</div>
                </div>
              </div>

              <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => handleMarkPaid(debt)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  ✓ שולם
                </button>
                {debt.profiles?.is_blocked && (
                  <button
                    onClick={() => handleUnblock(debt.profiles.id, debt.id)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold"
                    style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.3)' }}
                  >
                    🔓 הסר חסימה
                  </button>
                )}
                <button
                  onClick={() => handleDelete(debt)}
                  className="py-2 px-3 rounded-xl text-xs font-bold"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
