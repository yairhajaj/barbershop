import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { Modal } from '../../ui/Modal'
import { Spinner } from '../../ui/Spinner'
import { StatusBadge } from '../../ui/Badge'
import { useToast } from '../../ui/Toast'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { BUSINESS } from '../../../config/business'
import { printInvoice } from '../../../lib/invoice'
import { formatDate, formatTime } from '../../../lib/utils'

const PAYMENT_LABELS = { cash: 'מזומן', credit: 'כרטיס אשראי', bit: 'ביט', paybox: 'Paybox', transfer: 'העברה בנקאית' }

export function AppointmentDetailModal({ apt, open, onClose, onChange }) {
  const toast = useToast()
  const { settings } = useBusinessSettings()
  const [invoiceStep, setInvoiceStep] = useState(null) // null | 'paying' | 'done'
  const [invoiceData, setInvoiceData] = useState(null)
  const [apptDebtTotal, setApptDebtTotal] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setInvoiceStep(null); setInvoiceData(null); setApptDebtTotal(0) }
  }, [open, apt?.id])

  useEffect(() => {
    if (!apt?.profiles?.id || !open) return
    supabase.from('customer_debts').select('amount')
      .eq('customer_id', apt.profiles.id).eq('status', 'pending')
      .then(({ data }) => setApptDebtTotal((data ?? []).reduce((s, d) => s + Number(d.amount || 0), 0)))
  }, [apt?.profiles?.id, open])

  async function handlePayAndInvoice(method) {
    setInvoiceStep('paying')
    try {
      const vatRate = settings?.vat_rate || 18
      const isPatur = settings?.business_type === 'osek_patur'
      const price = Number(apt.services?.price) || 0
      const priceBeforeVat = isPatur ? price : Math.round((price / (1 + vatRate / 100)) * 100) / 100
      const vatAmount = isPatur ? 0 : Math.round((price - priceBeforeVat) * 100) / 100

      await supabase.from('appointments')
        .update({ payment_status: 'paid', cash_paid: method === 'cash', status: 'completed', invoice_sent: true })
        .eq('id', apt.id)

      await supabase.from('manual_income').insert({
        amount: price, vat_amount: vatAmount,
        description: apt.services?.name || 'תור',
        customer_name: apt.profiles?.name || '',
        staff_id: apt.staff_id, service_id: apt.service_id, appointment_id: apt.id,
        payment_method: method,
        date: apt.start_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      })

      const { data: invoiceNum } = await supabase.rpc('next_invoice_number')
      const { data: inv } = await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: apt.id,
        customer_name: apt.profiles?.name || '',
        customer_phone: apt.profiles?.phone || '',
        service_name: apt.services?.name || '',
        staff_name: apt.staff?.name || '',
        service_date: apt.start_at,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate, vat_amount: vatAmount, total_amount: price,
        status: 'paid', paid_at: new Date().toISOString(), notes: method,
      }).select().single()

      setInvoiceData({ ...inv, paymentMethod: method, appointment: apt })
      setInvoiceStep('done')
      onChange?.()
      toast({ message: 'תשלום נרשם וחשבונית נוצרה ✓', type: 'success' })
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
      setInvoiceStep(null)
    }
  }

  async function handleNoShow() {
    if (!confirm(`לסמן את ${apt.profiles?.name || 'הלקוח'} כ"לא הגיע"?`)) return
    setBusy(true)
    try {
      await supabase.from('appointments').update({ no_show: true, status: 'completed' }).eq('id', apt.id)
      toast({ message: 'סומן: לא הגיע', type: 'success' })
      onChange?.(); onClose()
    } catch (e) { toast({ message: e.message, type: 'error' }) }
    finally { setBusy(false) }
  }

  function doPrint() {
    printInvoice({
      appointment: apt, business: BUSINESS,
      footerText: settings?.invoice_footer_text,
      vatRate: settings?.vat_rate || 18,
      businessType: settings?.business_type || 'osek_morsheh',
      invoiceNumber: invoiceData?.invoice_number,
      businessTaxId: settings?.business_tax_id,
      paymentMethod: invoiceData?.notes,
      invoiceDate: invoiceData?.created_at,
      logoUrl: settings?.logo_url,
    })
  }

  if (!apt) return null

  const isPaid = apt.payment_status === 'paid' || apt.cash_paid
  const phone = apt.profiles?.phone
  const rawPhone = phone?.replace(/\D/g, '')
  const waPhone = rawPhone?.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
  const svcName = apt.services?.name ?? ''
  const waMsg = encodeURIComponent(
    `שלום ${apt.profiles?.name ?? ''}, רצינו להזכיר לך את התור שלך ל${svcName} בתאריך ${formatDate(apt.start_at)} בשעה ${formatTime(apt.start_at)}. נתראה! 💈`
  )

  return (
    <Modal open={open} onClose={onClose} title="פרטי תור">
      <div className="space-y-4">
        {apptDebtTotal > 0 && (
          <div className="text-center text-sm py-1.5 rounded-xl font-bold"
            style={{ background: 'var(--color-danger-tint)', color: '#dc2626', border: '1.5px solid var(--color-danger-ring)' }}>
            ⚠️ חוב: ₪{apptDebtTotal}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'לקוח',   value: apt.profiles?.name },
            { label: 'טלפון',  value: apt.profiles?.phone },
            { label: 'שירות',  value: apt.services?.name },
            { label: 'ספר',    value: apt.staff?.name },
            { label: 'תאריך',  value: formatDate(apt.start_at) },
            { label: 'שעה',    value: `${formatTime(apt.start_at)} — ${formatTime(apt.end_at)}` },
            { label: 'מחיר',   value: apt.services?.price ? `₪${apt.services.price}` : '-' },
            { label: 'סטטוס',  value: <StatusBadge status={apt.status} /> },
          ].map(row => (
            <div key={row.label}>
              <span className="text-muted">{row.label}: </span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>

        {apt.notes && (
          <p className="text-sm rounded-lg p-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <span className="text-muted">הערות: </span>{apt.notes}
          </p>
        )}

        {phone && (
          <div className="flex gap-2">
            <a href={`tel:${phone}`}
              className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm"
              style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              התקשר
            </a>
            {waPhone && (
              <a href={`https://wa.me/${waPhone}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm"
                style={{ background: '#25D366', color: '#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
            )}
          </div>
        )}

        {/* Payment panel */}
        {invoiceStep === 'done' && invoiceData ? (
          <div className="space-y-2">
            <div className="text-center text-sm py-2 rounded-xl font-bold"
              style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}>
              ✅ שולם ב{PAYMENT_LABELS[invoiceData.paymentMethod] || invoiceData.paymentMethod} · חשבונית {invoiceData.invoice_number}
            </div>
            <button onClick={doPrint}
              className="w-full py-2.5 rounded-xl font-bold text-sm"
              style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}>
              🖨 הדפס חשבונית
            </button>
          </div>
        ) : invoiceStep === 'paying' ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm" style={{ color: 'var(--color-muted)' }}>
            <Spinner size="sm" /> רושם תשלום ומפיק חשבונית...
          </div>
        ) : isPaid ? (
          <div className="text-center text-sm py-2 rounded-xl font-bold"
            style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}>
            ✅ שולם
          </div>
        ) : apt.status === 'confirmed' ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>בחר אמצעי תשלום להפקת חשבונית:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'cash',     icon: '💵', label: 'מזומן' },
                { key: 'credit',   icon: '💳', label: 'אשראי' },
                { key: 'bit',      icon: '📱', label: 'ביט' },
                { key: 'paybox',   icon: '📦', label: 'Paybox' },
                { key: 'transfer', icon: '🏦', label: 'העברה' },
              ].map(({ key, icon, label }) => (
                <motion.button key={key} whileTap={{ scale: 0.96 }}
                  onClick={() => handlePayAndInvoice(key)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}>
                  {icon} {label}
                </motion.button>
              ))}
            </div>
          </div>
        ) : null}

        {apt.status === 'confirmed' && !isPaid && invoiceStep !== 'done' && (
          <button onClick={handleNoShow} disabled={busy}
            className="w-full py-2 px-3 rounded-lg font-medium text-sm"
            style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-muted)', opacity: busy ? 0.6 : 1 }}>
            👻 לא הגיע
          </button>
        )}

        {apt.no_show && (
          <div className="text-center text-sm py-1 rounded-lg" style={{ background: '#fff3cd', color: '#856404' }}>
            ⚠️ לקוח זה סומן כ&quot;לא הגיע&quot;
          </div>
        )}
      </div>
    </Modal>
  )
}
