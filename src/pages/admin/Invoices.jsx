import { useState } from 'react'
import { useInvoices } from '../../hooks/useInvoices'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { Spinner } from '../../components/ui/Spinner'
import { printInvoice } from '../../lib/invoice'
import { formatDate, formatTime } from '../../lib/utils'
import { BUSINESS } from '../../config/business'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

const STATUS_TABS = [
  { key: 'all',   label: 'הכל' },
  { key: 'paid',  label: 'שולמו' },
  { key: 'sent',  label: 'נשלחו' },
  { key: 'draft', label: 'טיוטות' },
]

const STATUS_BADGE = {
  paid:  { label: 'שולמה',  bg: 'rgba(34,197,94,0.1)',   color: '#16a34a' },
  sent:  { label: 'נשלחה',  bg: 'rgba(59,130,246,0.1)',  color: '#2563eb' },
  draft: { label: 'טיוטה',  bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
}

const PAYMENT_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bit: 'ביט', transfer: 'העברה',
}

export function Invoices() {
  const [tab, setTab] = useState('all')
  const toast = useToast()
  const { settings } = useBusinessSettings()
  const { invoices, loading, markPaid, deleteInvoice } = useInvoices(
    tab !== 'all' ? { status: tab } : {}
  )

  async function handlePrint(inv) {
    // Fetch appointment details for the invoice
    const { data: appt } = await supabase
      .from('appointments')
      .select('*, profiles(name, phone), services(name, price), staff(name)')
      .eq('id', inv.appointment_id)
      .maybeSingle()

    // Build a minimal appointment object if not found
    const apptObj = appt || {
      id: inv.appointment_id || 'N/A',
      start_at: inv.service_date,
      profiles: { name: inv.customer_name, phone: inv.customer_phone },
      services: { name: inv.service_name, price: inv.total_amount },
      staff: { name: inv.staff_name },
    }

    printInvoice({
      appointment: apptObj,
      business: BUSINESS,
      footerText: settings?.invoice_footer_text,
      vatRate: inv.vat_rate || settings?.vat_rate || 18,
      businessType: settings?.business_type || 'osek_morsheh',
      invoiceNumber: inv.invoice_number,
      businessTaxId: settings?.business_tax_id,
      paymentMethod: inv.notes,
      invoiceDate: inv.created_at,
    })
  }

  async function handleSendWhatsApp(inv) {
    const phone = inv.customer_phone?.replace(/\D/g, '') || ''
    const intlPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone
    const msg = encodeURIComponent(
      `שלום ${inv.customer_name || ''}! 🧾\n` +
      `חשבונית מס׳ ${inv.invoice_number} עבור ${inv.service_name}.\n` +
      `סה"כ: ₪${inv.total_amount} | ${PAYMENT_LABELS[inv.notes] || inv.notes || ''}\n` +
      `תודה על הביקור! 💈`
    )
    window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank')
    if (inv.status === 'draft') {
      await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', inv.id)
    }
  }

  async function handleMarkPaid(inv) {
    try {
      await markPaid(inv.id)
      toast({ message: 'חשבונית סומנה כשולמה ✓', type: 'success' })
    } catch (e) {
      toast({ message: e.message, type: 'error' })
    }
  }

  async function handleDelete(inv) {
    if (!confirm(`למחוק חשבונית ${inv.invoice_number}?`)) return
    try {
      await deleteInvoice(inv.id)
      toast({ message: 'חשבונית נמחקה', type: 'success' })
    } catch (e) {
      toast({ message: e.message, type: 'error' })
    }
  }

  const totalAmount = invoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>חשבוניות</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {invoices.length} חשבוניות · סה"כ ₪{totalAmount.toLocaleString('he-IL')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--color-surface)' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tab === t.key ? 'var(--color-card)' : 'transparent',
              color: tab === t.key ? 'var(--color-gold)' : 'var(--color-muted)',
              boxShadow: tab === t.key ? 'var(--shadow-card)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          <div className="text-5xl mb-3">🧾</div>
          <p className="font-medium">אין חשבוניות</p>
          <p className="text-sm mt-1">חשבוניות נוצרות אוטומטית ברגע שמסמנים תשלום מפרטי התור</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map(inv => {
            const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.draft
            return (
              <div
                key={inv.id}
                className="rounded-2xl p-4"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-sm" style={{ color: 'var(--color-gold)' }}>{inv.invoice_number}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                      {inv.notes && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{PAYMENT_LABELS[inv.notes] || inv.notes}</span>}
                    </div>
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>{inv.customer_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {inv.service_name}
                      {inv.staff_name ? ` · ${inv.staff_name}` : ''}
                      {inv.service_date ? ` · ${formatDate(inv.service_date)}` : ''}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-black text-lg" style={{ color: 'var(--color-text)' }}>₪{Number(inv.total_amount).toLocaleString('he-IL')}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{formatDate(inv.created_at)}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => handlePrint(inv)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    🖨 הדפס
                  </button>
                  {inv.customer_phone && (
                    <button
                      onClick={() => handleSendWhatsApp(inv)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all"
                      style={{ background: '#25D366' }}
                    >
                      📱 שלח
                    </button>
                  )}
                  {inv.status !== 'paid' && (
                    <button
                      onClick={() => handleMarkPaid(inv)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      ✓ שולמה
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(inv)}
                    className="py-2 px-3 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
