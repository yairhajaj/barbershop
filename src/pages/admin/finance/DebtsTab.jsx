import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Spinner } from '../../../components/ui/Spinner'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatDate } from '../../../lib/utils'

const PAYMENT_LABELS = {
  cash: '💵 מזומן', credit: '💳 אשראי', bit: '📱 ביט', paybox: '📦 Paybox', transfer: '🏦 העברה',
}

export function DebtsTab() {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState({ open: false, debt: null })
  const [payMethod, setPayMethod] = useState('cash')
  const [paying, setPaying] = useState(false)
  const toast = useToast()
  const { settings } = useBusinessSettings()

  async function fetchDebts() {
    setLoading(true)
    const { data } = await supabase
      .from('customer_debts')
      .select(`
        *,
        profiles:customer_id(id, name, phone, is_blocked),
        appointments:appointment_id(start_at, staff_id, service_id, services(name, price), staff(name))
      `)
      .order('created_at', { ascending: false })
    setDebts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchDebts() }, [])

  function openPayModal(debt) {
    setPayMethod('cash')
    setPayModal({ open: true, debt })
  }

  async function confirmDebtPayment() {
    const { debt } = payModal
    setPaying(true)
    try {
      const vatRate        = settings?.vat_rate || 18
      const businessType   = settings?.business_type || 'osek_morsheh'
      const price          = Number(debt.amount)
      const isPatur        = businessType === 'osek_patur'
      const priceBeforeVat = isPatur ? price : Math.round(price / (1 + vatRate / 100))
      const vatAmount      = isPatur ? 0 : price - priceBeforeVat
      const now            = new Date().toISOString()

      // 1. Invoice number
      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')

      // 2. Insert invoice
      await supabase.from('invoices').insert({
        invoice_number:    invoiceNum,
        appointment_id:    debt.appointment_id ?? null,
        customer_name:     debt.profiles?.name  || '',
        customer_phone:    debt.profiles?.phone || '',
        service_name:      debt.appointments?.services?.name || debt.description || '',
        staff_name:        debt.appointments?.staff?.name    || '',
        service_date:      debt.appointments?.start_at ?? debt.created_at,
        amount_before_vat: priceBeforeVat,
        vat_rate:          vatRate,
        vat_amount:        vatAmount,
        total_amount:      price,
        status:            'paid',
        paid_at:           now,
        notes:             payMethod,
      })

      // 3. Insert manual_income
      await supabase.from('manual_income').insert({
        amount:         price,
        vat_amount:     vatAmount,
        description:    debt.appointments?.services?.name || debt.description || 'תשלום חוב',
        customer_name:  debt.profiles?.name || '',
        staff_id:       debt.appointments?.staff_id  ?? null,
        service_id:     debt.appointments?.service_id ?? null,
        appointment_id: debt.appointment_id ?? null,
        payment_method: payMethod,
        date:           now.slice(0, 10),
      })

      // 4. Update appointment payment_status if exists
      if (debt.appointment_id) {
        await supabase.from('appointments')
          .update({ payment_status: 'paid', cash_paid: payMethod === 'cash' })
          .eq('id', debt.appointment_id)
      }

      // 5. Mark debt paid
      await supabase.from('customer_debts')
        .update({ status: 'paid', paid_at: now })
        .eq('id', debt.id)

      // 6. Auto-unblock if no more pending debts for this customer
      if (debt.profiles?.is_blocked) {
        const remaining = debts.filter(d =>
          d.id !== debt.id && d.status === 'pending' && d.customer_id === debt.customer_id
        )
        if (remaining.length === 0) {
          await supabase.from('profiles').update({ is_blocked: false }).eq('id', debt.profiles.id)
        }
      }

      setPayModal({ open: false, debt: null })
      toast({ message: 'חוב שולם + חשבונית הופקה ✓', type: 'success' })
      fetchDebts()
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally {
      setPaying(false)
    }
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

  const pendingDebts = debts.filter(d => d.status === 'pending')
  const total = pendingDebts.reduce((s, d) => s + (Number(d.amount) || 0), 0)

  return (
    <div>
      {/* Summary */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted)' }}>חובות פתוחים</p>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-black" style={{ color: 'var(--color-gold)' }}>₪{total.toLocaleString('he-IL')}</span>
          <span className="text-sm pb-1" style={{ color: 'var(--color-muted)' }}>{pendingDebts.length} חובות</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : debts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          <div className="text-5xl mb-3">✅</div>
          <p className="font-medium">אין חובות</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {debts.map(debt => (
            <div
              key={debt.id}
              className="rounded-2xl p-4"
              style={{
                background: 'var(--color-card)',
                border: `1px solid ${debt.status === 'paid' ? 'rgba(34,197,94,0.2)' : 'var(--color-border)'}`,
                boxShadow: 'var(--shadow-card)',
                opacity: debt.status === 'paid' ? 0.75 : 1,
              }}
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
                  <div className="font-black text-lg" style={{ color: debt.status === 'paid' ? '#16a34a' : '#d97706' }}>
                    ₪{Number(debt.amount).toLocaleString('he-IL')}
                  </div>
                  {debt.status === 'paid' ? (
                    <div className="text-[10px] mt-0.5 text-right" style={{ color: '#16a34a' }}>✓ שולם {formatDate(debt.paid_at)}</div>
                  ) : (
                    <div className="text-[10px] mt-0.5 text-right" style={{ color: '#dc2626' }}>פתוח</div>
                  )}
                </div>
              </div>

              {/* Actions — only for pending */}
              {debt.status === 'pending' && (
                <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => openPayModal(debt)}
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
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payment method modal */}
      <Modal open={payModal.open} onClose={() => setPayModal({ open: false, debt: null })} title="💳 כיצד שולם?">
        {payModal.debt && (
          <div className="space-y-4">
            <p className="text-sm text-center font-semibold" style={{ color: 'var(--color-text)' }}>
              {payModal.debt.profiles?.name} · ₪{Number(payModal.debt.amount).toLocaleString('he-IL')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPayMethod(key)}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: payMethod === key ? 'var(--color-gold)' : 'var(--color-surface)',
                    color: payMethod === key ? '#000' : 'var(--color-text)',
                    border: `1.5px solid ${payMethod === key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={confirmDebtPayment}
              disabled={paying}
              className="w-full py-3 rounded-xl font-bold text-sm transition-opacity"
              style={{ background: 'var(--color-gold)', color: '#000', opacity: paying ? 0.7 : 1 }}
            >
              {paying ? 'מעבד...' : 'אשר תשלום + הפק חשבונית'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
