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
  paid:  { label: 'שולמה',  bg: 'var(--color-success-tint)',   color: '#16a34a' },
  sent:  { label: 'נשלחה',  bg: 'var(--color-info-tint)',  color: '#2563eb' },
  draft: { label: 'טיוטה',  bg: 'var(--color-gray-ring)', color: '#6b7280' },
}

const PAYMENT_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bit: 'ביט', paybox: 'Paybox', transfer: 'העברה',
}

export function Invoices() {
  const [tab, setTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [creditConfirmInv, setCreditConfirmInv] = useState(null)
  const [creditBusy, setCreditBusy] = useState(false)
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
      logoUrl: settings?.logo_url,
      isCopy: !!inv.invoice_sent_at,
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

  async function handleCreateCredit(inv) {
    setCreditBusy(true)
    try {
      await deleteInvoice(inv.id)
      toast({ message: `חשבונית זיכוי הופקה עבור ${inv.invoice_number} ✓`, type: 'success' })
      setCreditConfirmInv(null)
    } catch (e) {
      toast({ message: e.message, type: 'error' })
    } finally {
      setCreditBusy(false)
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const match =
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.invoice_number?.toLowerCase().includes(q)
      if (!match) return false
    }
    if (dateFilter) {
      const invDate = (inv.service_date || inv.created_at || '').slice(0, 10)
      if (invDate !== dateFilter) return false
    }
    return true
  })

  const totalAmount = filteredInvoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)

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

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <span className="absolute top-1/2 -translate-y-1/2 right-3 text-base" style={{ color: 'var(--color-muted)' }}>🔍</span>
          <input
            className="input-field pr-9 w-full text-sm"
            placeholder="חיפוש לפי שם לקוח..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: dateFilter ? 'var(--color-text)' : 'var(--color-muted)' }}
        />
        {(searchQuery || dateFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setDateFilter('') }}
            className="px-3 rounded-xl text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--color-muted)' }}>
          <div className="text-5xl mb-3">🧾</div>
          <p className="font-medium">{searchQuery ? 'לא נמצאו חשבוניות' : 'אין חשבוניות'}</p>
          <p className="text-sm mt-1">{searchQuery ? 'נסה חיפוש אחר' : 'חשבוניות נוצרות אוטומטית ברגע שמסמנים תשלום מפרטי התור'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredInvoices.map(inv => {
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
                      style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1px solid var(--color-success-ring)' }}
                    >
                      ✓ שולמה
                    </button>
                  )}
                  {inv.is_credit_note ? (
                    <span className="py-2 px-3 rounded-xl text-xs font-bold"
                      style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                      זיכוי
                    </span>
                  ) : (
                    <button
                      onClick={() => setCreditConfirmInv(inv)}
                      className="py-2 px-3 rounded-xl text-xs font-bold transition-all"
                      style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                      זיכוי
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Credit note confirmation modal */}
      {creditConfirmInv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !creditBusy && setCreditConfirmInv(null)}>
          <div className="card modal-bg p-5 max-w-sm w-full space-y-4"
            style={{ background: 'var(--color-modal-panel)', border: '1px solid #fecaca' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base" style={{ color: '#dc2626' }}>הפקת חשבונית זיכוי</h3>
            <div className="text-sm space-y-2" style={{ color: 'var(--color-text)' }}>
              <p>לפי חוק בישראל, ביטול חשבונית מתבצע על ידי הפקת <strong>חשבונית זיכוי</strong> — לא מחיקה.</p>
              <p style={{ color: 'var(--color-muted)' }}>
                חשבונית <strong>{creditConfirmInv.invoice_number}</strong> של {creditConfirmInv.customer_name} תסומן כמבוטלת
                ותיפתח חשבונית זיכוי חדשה על סך ₪{Number(creditConfirmInv.total_amount).toLocaleString('he-IL')}.
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>שתי הרשומות יישמרו במערכת לצורכי ביקורת.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCreateCredit(creditConfirmInv)}
                disabled={creditBusy}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: '#dc2626', color: '#fff' }}>
                {creditBusy ? 'מפיק...' : 'אשר — הפק זיכוי'}
              </button>
              <button
                onClick={() => setCreditConfirmInv(null)}
                disabled={creditBusy}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
