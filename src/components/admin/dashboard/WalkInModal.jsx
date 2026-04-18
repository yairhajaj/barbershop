import { useState, useEffect } from 'react'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../../lib/supabase'
import { useServices } from '../../../hooks/useServices'
import { useStaff } from '../../../hooks/useStaff'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'

const PAYMENT_LABELS = {
  cash: '💵 מזומן', credit: '💳 אשראי', bit: '📱 ביט', paybox: '📦 Paybox', transfer: '🏦 העברה',
}

/**
 * Quick walk-in receipt modal — creates invoice + manual_income in one action.
 * No appointment required.
 */
export function WalkInModal({ open, onClose, onSaved }) {
  const toast = useToast()
  const { services } = useServices()
  const { staff } = useStaff({ activeOnly: true })
  const { settings } = useBusinessSettings()

  const [amount, setAmount] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [busy, setBusy] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount(''); setServiceId(''); setStaffId('')
      setCustomerName(''); setPayMethod('cash')
    }
  }, [open])

  // Auto-fill amount when service selected
  useEffect(() => {
    if (serviceId) {
      const s = services.find(x => x.id === serviceId)
      if (s?.price) setAmount(String(s.price))
    }
  }, [serviceId, services])

  async function save() {
    const price = Number(amount)
    if (!price || price <= 0) {
      toast({ message: 'הזן סכום', type: 'error' })
      return
    }
    setBusy(true)
    try {
      const vatRate = settings?.vat_rate || 18
      const isPatur = settings?.business_type === 'osek_patur'
      const priceBeforeVat = isPatur ? price : Math.round(price / (1 + vatRate / 100))
      const vatAmount = isPatur ? 0 : price - priceBeforeVat
      const nowIso = new Date().toISOString()
      const today = nowIso.slice(0, 10)

      const service = services.find(s => s.id === serviceId)
      const staffMember = staff.find(s => s.id === staffId)
      const serviceName = service?.name || 'תקבול מהיר'

      // 1. invoice number
      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')

      // 2. invoice row
      await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: null,
        customer_name: customerName || '',
        customer_phone: '',
        service_name: serviceName,
        staff_name: staffMember?.name || '',
        service_date: nowIso,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: price,
        status: 'paid',
        paid_at: nowIso,
        notes: payMethod,
      })

      // 3. manual_income
      await supabase.from('manual_income').insert({
        amount: price,
        vat_amount: vatAmount,
        description: serviceName,
        customer_name: customerName || '',
        staff_id: staffId || null,
        service_id: serviceId || null,
        appointment_id: null,
        payment_method: payMethod,
        date: today,
      })

      toast({ message: 'תקבול נרשם + חשבונית הופקה ✓', type: 'success' })
      onSaved?.()
      onClose()
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="💰 תקבול מהיר (Walk-in)">
      <div className="space-y-3">
        {/* Amount */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>סכום ₪</label>
          <input type="number" inputMode="decimal" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input w-full text-lg font-black text-center"
            placeholder="100" />
        </div>

        {/* Service (optional) */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>שירות (אופציונלי)</label>
          <select value={serviceId} onChange={e => setServiceId(e.target.value)} className="input w-full">
            <option value="">— ללא שירות —</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name} — ₪{s.price}</option>
            ))}
          </select>
        </div>

        {/* Staff (optional) */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>ספר (אופציונלי)</label>
          <select value={staffId} onChange={e => setStaffId(e.target.value)} className="input w-full">
            <option value="">— ללא ספר —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Customer name */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>שם לקוח (אופציונלי)</label>
          <input value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            className="input w-full" placeholder="לקוח מזדמן" />
        </div>

        {/* Payment method */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>אמצעי תשלום</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
              <button key={k} onClick={() => setPayMethod(k)}
                className="py-2 rounded-xl text-xs font-bold"
                style={{
                  background: payMethod === k ? 'var(--color-gold)' : 'var(--color-surface)',
                  color: payMethod === k ? '#000' : 'var(--color-text)',
                  border: `1.5px solid ${payMethod === k ? 'var(--color-gold)' : 'var(--color-border)'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={busy}
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-gold)', color: '#000', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'מעבד...' : '✓ אשר + הפק חשבונית'}
        </button>
      </div>
    </Modal>
  )
}
