import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../ui/Toast'
import { Modal } from '../../ui/Modal'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatTime } from '../../../lib/utils'
import { BUSINESS } from '../../../config/business'

const PAYMENT_LABELS = {
  cash: '💵 מזומן', credit: '💳 אשראי', bit: '📱 ביט', paybox: '📦 Paybox', transfer: '🏦 העברה',
}

/**
 * Hero card — "the next appointment" with live countdown + quick actions.
 * Props: apt (appointment with joined profiles/services/staff), onChange (refetch callback).
 */
export function NextAppointmentHero({ apt, onChange }) {
  const toast = useToast()
  const { settings } = useBusinessSettings()
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')

  // Live countdown — tick every 30s
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(i)
  }, [])

  if (!apt) {
    return (
      <div className="rounded-3xl p-8 text-center mb-5"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        <div className="text-5xl mb-3">☕</div>
        <p className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>אין תורים קרובים</p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>יום שקט · זמן טוב לתכנן אסטרטגיה</p>
      </div>
    )
  }

  const start = new Date(apt.start_at).getTime()
  const diffMin = Math.round((start - now) / 60000)
  const countdown = diffMin > 60
    ? `עוד ${Math.floor(diffMin / 60)} שע' ${diffMin % 60} דק'`
    : diffMin > 1  ? `עוד ${diffMin} דק'`
    : diffMin >= -1 ? '🔔 עכשיו'
    : diffMin > -60 ? `⚠️ באיחור ${-diffMin} דק'`
    : `התחיל לפני ${Math.floor(-diffMin / 60)} שע'`

  const isImminent = diffMin <= 5 && diffMin >= -15

  async function openPay() {
    setPayMethod('cash')
    setPayModal(true)
  }

  async function confirmArrived() {
    setBusy(true)
    try {
      const vatRate = settings?.vat_rate || 18
      const isPatur = settings?.business_type === 'osek_patur'
      const price = Number(apt.services?.price || 0)
      const priceBeforeVat = isPatur ? price : Math.round(price / (1 + vatRate / 100))
      const vatAmount = isPatur ? 0 : price - priceBeforeVat
      const nowIso = new Date().toISOString()

      // 1. Invoice number + create invoice
      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')
      await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: apt.id,
        customer_name: apt.profiles?.name || '',
        customer_phone: apt.profiles?.phone || '',
        service_name: apt.services?.name || '',
        staff_name: apt.staff?.name || '',
        service_date: apt.start_at,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: price,
        status: 'paid',
        paid_at: nowIso,
        notes: payMethod,
      })

      // 2. manual_income
      await supabase.from('manual_income').insert({
        amount: price,
        vat_amount: vatAmount,
        description: apt.services?.name || 'תור',
        customer_name: apt.profiles?.name || '',
        staff_id: apt.staff_id ?? null,
        service_id: apt.service_id ?? null,
        appointment_id: apt.id,
        payment_method: payMethod,
        date: nowIso.slice(0, 10),
      })

      // 3. Update appointment
      await supabase.from('appointments')
        .update({ status: 'completed', payment_status: 'paid', invoice_sent: true, cash_paid: payMethod === 'cash' })
        .eq('id', apt.id)

      setPayModal(false)
      toast({ message: 'הגיע + שולם · חשבונית הופקה ✓', type: 'success' })
      onChange?.()
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function markNoShow() {
    if (!confirm(`לסמן את ${apt.profiles?.name || 'הלקוח'} כ"לא הגיע"?`)) return
    setBusy(true)
    try {
      await supabase.from('appointments')
        .update({ no_show: true, status: 'cancelled', cancelled_by: 'no_show' })
        .eq('id', apt.id)
      toast({ message: 'סומן "לא הגיע"', type: 'success' })
      onChange?.()
    } catch (e) {
      toast({ message: e.message, type: 'error' })
    } finally { setBusy(false) }
  }

  async function postpone15() {
    setBusy(true)
    try {
      const newStart = new Date(new Date(apt.start_at).getTime() + 15 * 60_000).toISOString()
      const newEnd   = apt.end_at ? new Date(new Date(apt.end_at).getTime() + 15 * 60_000).toISOString() : null
      await supabase.from('appointments')
        .update({ start_at: newStart, ...(newEnd && { end_at: newEnd }) })
        .eq('id', apt.id)
      toast({ message: 'נדחה ב-15 דק', type: 'success' })
      onChange?.()
    } catch (e) { toast({ message: e.message, type: 'error' }) }
    finally { setBusy(false) }
  }

  const phone = apt.profiles?.phone?.replace(/\D/g, '')
  const waNumber = phone?.startsWith('0') ? `972${phone.slice(1)}` : phone

  return (
    <div className="rounded-3xl p-5 mb-5 relative overflow-hidden"
      style={{
        background: isImminent
          ? 'linear-gradient(135deg, rgba(255,122,0,0.12), rgba(255,122,0,0.04))'
          : 'var(--color-card)',
        border: `2px solid ${isImminent ? 'var(--color-gold)' : 'var(--color-border)'}`,
        boxShadow: 'var(--shadow-card)',
      }}>

      {/* Header: countdown + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            התור הבא
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
            {formatTime(apt.start_at)}
          </span>
        </div>
        <span className="text-sm font-black"
          style={{ color: isImminent ? 'var(--color-gold)' : 'var(--color-text)' }}>
          {countdown}
        </span>
      </div>

      {/* Customer info */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            {apt.profiles?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg truncate" style={{ color: 'var(--color-text)' }}>
              {apt.profiles?.name || '—'}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
              {apt.services?.name} · {apt.staff?.name}
            </div>
            {phone && (
              <div className="flex gap-2 mt-1.5">
                <a href={`tel:${apt.profiles.phone}`}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb' }}>
                  📞 {apt.profiles.phone}
                </a>
                {waNumber && (
                  <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
                    className="text-[11px] font-bold px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                    💬 WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="text-left flex-shrink-0">
            <div className="text-2xl font-black" style={{ color: 'var(--color-gold)' }}>
              ₪{Number(apt.services?.price || 0).toLocaleString('he-IL')}
            </div>
          </div>
        </div>
      </div>

      {/* Quick action buttons — 2x2 grid */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={openPay} disabled={busy}
          className="py-3 rounded-xl text-sm font-black transition-all active:scale-95"
          style={{ background: 'var(--color-gold)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
          ✅ הגיע + שולם
        </button>
        <button onClick={markNoShow} disabled={busy}
          className="py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.3)' }}>
          ❌ לא הגיע
        </button>
        <button onClick={postpone15} disabled={busy}
          className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          ⏭️ דחה 15 דק
        </button>
        <button onClick={openPay} disabled={busy}
          className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          🧾 חשבונית
        </button>
      </div>

      {/* Payment method modal */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="💳 כיצד שולם?">
        <div className="space-y-4">
          <p className="text-sm text-center font-semibold" style={{ color: 'var(--color-text)' }}>
            {apt.profiles?.name} · ₪{Number(apt.services?.price || 0).toLocaleString('he-IL')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => setPayMethod(key)}
                className="py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: payMethod === key ? 'var(--color-gold)' : 'var(--color-surface)',
                  color: payMethod === key ? '#000' : 'var(--color-text)',
                  border: `1.5px solid ${payMethod === key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={confirmArrived} disabled={busy}
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: 'var(--color-gold)', color: '#000', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'מעבד...' : 'אשר + הפק חשבונית'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
