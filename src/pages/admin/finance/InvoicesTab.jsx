import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useInvoices } from '../../../hooks/useInvoices'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatILS, calcVat, invoiceTitle, hasVat } from '../../../lib/finance'
import { printInvoice } from '../../../lib/invoice'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { format } from 'date-fns'
import { he } from 'date-fns/locale/he'

const STATUS_FILTERS = [
  { key: 'all',   label: 'הכל' },
  { key: 'draft', label: 'טיוטה' },
  { key: 'sent',  label: 'נשלחה' },
  { key: 'paid',  label: 'שולמה' },
]

const STATUS_STYLES = {
  draft: { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', label: 'טיוטה' },
  sent:  { color: '#2563eb', bg: 'rgba(37,99,235,0.08)',   border: 'rgba(37,99,235,0.2)',   label: 'נשלחה' },
  paid:  { color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)',   label: 'שולמה' },
}

export function InvoicesTab() {
  const showToast = useToast()
  const { settings } = useBusinessSettings()
  const [filter, setFilter] = useState('all')
  const { invoices, loading, createInvoice, markPaid, cancelInvoice, markSent } = useInvoices({
    status: filter === 'all' ? undefined : filter,
  })

  // Generate invoice modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [appointments, setAppointments] = useState([])
  const [aptsLoading, setAptsLoading] = useState(false)
  const [selected, setSelected] = useState({})
  const [generating, setGenerating] = useState(false)

  const businessType = settings?.business_type || 'osek_morsheh'
  const vatRate = settings?.vat_rate ?? 18

  // Fetch completed appointments for selected month
  useEffect(() => {
    if (!showGenerate) return
    fetchAppointments()
  }, [selectedMonth, showGenerate])

  async function fetchAppointments() {
    setAptsLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

    const { data, error } = await supabase
      .from('appointments')
      .select('id, start_at, price, profiles:customer_id(id, name, phone), services(id, name, price), staff(id, name)')
      .eq('status', 'completed')
      .gte('start_at', startDate)
      .lte('start_at', endDate)
      .order('start_at', { ascending: false })

    if (error) {
      showToast({ message: 'שגיאה בטעינת תורים', type: 'error' })
      setAptsLoading(false)
      return
    }

    // Filter out appointments that already have invoices
    const aptIds = (data ?? []).map(a => a.id)
    let invoicedIds = new Set()
    if (aptIds.length > 0) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('appointment_id')
        .in('appointment_id', aptIds)
      invoicedIds = new Set((existing ?? []).map(e => e.appointment_id))
    }

    setAppointments((data ?? []).filter(a => !invoicedIds.has(a.id)))
    setSelected({})
    setAptsLoading(false)
  }

  function toggleSelect(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleAll() {
    const allSelected = appointments.every(a => selected[a.id])
    if (allSelected) {
      setSelected({})
    } else {
      const all = {}
      appointments.forEach(a => { all[a.id] = true })
      setSelected(all)
    }
  }

  async function handleGenerate() {
    const toGenerate = appointments.filter(a => selected[a.id])
    if (toGenerate.length === 0) {
      showToast({ message: 'בחר תורים להפקה', type: 'error' })
      return
    }

    setGenerating(true)
    let count = 0
    for (const apt of toGenerate) {
      try {
        const price = Number(apt.price || apt.services?.price || 0)
        const vat = calcVat(price, vatRate, businessType)

        await createInvoice({
          appointment_id: apt.id,
          customer_name: apt.profiles?.name || '',
          customer_phone: apt.profiles?.phone || '',
          service_name: apt.services?.name || '',
          staff_name: apt.staff?.name || '',
          service_date: apt.start_at,
          amount_before_vat: vat.beforeVat,
          vat_amount: vat.vatAmount,
          total_amount: vat.total,
          status: 'draft',
        })
        count++
      } catch (err) {
        showToast({ message: `שגיאה: ${err.message}`, type: 'error' })
      }
    }

    showToast({ message: `${count} חשבוניות הופקו בהצלחה`, type: 'success' })
    setGenerating(false)
    setShowGenerate(false)
  }

  function handlePrint(inv) {
    const business = {
      name: settings?.business_name || 'HAJAJ Hair Design',
      address: settings?.business_address || '',
      phone: settings?.business_phone || '',
      email: settings?.business_email || '',
    }

    printInvoice({
      appointment: {
        id: inv.id,
        start_at: inv.service_date,
        profiles: { name: inv.customer_name, phone: inv.customer_phone },
        services: { name: inv.service_name, price: inv.total_amount },
        staff: { name: inv.staff_name },
      },
      business,
      footerText: settings?.invoice_footer_text,
    })
  }

  function handleWhatsApp(inv) {
    const phone = (inv.customer_phone || '').replace(/\D/g, '')
    const intlPhone = phone.startsWith('0') ? `972${phone.slice(1)}` : phone
    const docType = invoiceTitle(businessType)
    const text = encodeURIComponent(
      `${docType} מס' ${inv.invoice_number}\n` +
      `${inv.service_name} - ${format(new Date(inv.service_date), 'dd/MM/yyyy', { locale: he })}\n` +
      `סה"כ: ${formatILS(inv.total_amount)}\n` +
      `תודה רבה!`
    )
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank')
  }

  async function handleMarkPaid(inv) {
    try {
      await markPaid(inv.id)
      showToast({ message: 'סומנה כשולמה', type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    }
  }

  async function handleCancel(inv) {
    const reason = window.prompt(
      `ביטול חשבונית ${inv.invoice_number}.\n\n` +
      `לפי החוק, לא ניתן למחוק חשבונית; במקום זאת תיווצר חשבונית זיכוי.\n\n` +
      `סיבת הביטול:`
    )
    if (reason === null) return
    try {
      const { creditNote } = await cancelInvoice(inv.id, reason)
      showToast({
        message: creditNote
          ? `החשבונית בוטלה. חשבונית זיכוי ${creditNote.invoice_number} נוצרה`
          : 'החשבונית (טיוטה) בוטלה',
        type: 'success',
      })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Filter tabs + generate button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: filter === f.key ? 'var(--color-gold)' : 'var(--color-card)',
                color: filter === f.key ? '#fff' : 'var(--color-muted)',
                border: filter === f.key ? 'none' : '1px solid var(--color-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowGenerate(true)}
          className="btn-primary px-4 py-2 text-sm"
        >
          + הפק חשבונית
        </button>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : invoices.length === 0 ? (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-4">🧾</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
            אין חשבוניות
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            לחץ "הפק חשבונית" כדי ליצור חשבונית חדשה
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((inv, i) => {
            const st = STATUS_STYLES[inv.status] || STATUS_STYLES.draft
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-bold text-sm"
                        style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                      >
                        {inv.invoice_number}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--color-text)' }}>
                      {inv.customer_name}
                    </p>
                    <div className="flex gap-x-3 flex-wrap text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {inv.customer_phone && <span>{inv.customer_phone}</span>}
                      {inv.service_name && <span>{inv.service_name}</span>}
                      {inv.service_date && (
                        <span>{format(new Date(inv.service_date), 'dd/MM/yyyy', { locale: he })}</span>
                      )}
                    </div>
                  </div>
                  <span className="font-black text-lg flex-shrink-0" style={{ color: 'var(--color-gold)' }}>
                    {formatILS(inv.total_amount)}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handlePrint(inv)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    🖨️ הדפס
                  </button>
                  <button
                    onClick={() => handleWhatsApp(inv)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    📱 WhatsApp
                  </button>
                  {inv.status !== 'paid' && (
                    <button
                      onClick={() => handleMarkPaid(inv)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', color: '#16a34a' }}
                    >
                      ✅ שולמה
                    </button>
                  )}
                  {!inv.is_cancelled && !inv.credit_note_for && (
                    <button
                      onClick={() => handleCancel(inv)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)', color: '#dc2626' }}
                    >
                      ❌ בטל
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Generate Invoice Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="הפקת חשבוניות" size="lg">
        <div className="space-y-4">
          {/* Month picker */}
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>
              בחר חודש
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>

          {/* Appointments list */}
          {aptsLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 rounded-xl" style={{ background: 'var(--color-surface)' }}>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                אין תורים שהושלמו בחודש זה (או שכולם כבר חויבו)
              </p>
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center justify-between">
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-gold)' }}
                >
                  {appointments.every(a => selected[a.id]) ? 'בטל הכל' : 'בחר הכל'}
                </button>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {selectedCount} / {appointments.length} נבחרו
                </span>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {appointments.map(apt => (
                  <label
                    key={apt.id}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                    style={{
                      background: selected[apt.id] ? 'rgba(201,169,110,0.08)' : 'var(--color-surface)',
                      border: `1px solid ${selected[apt.id] ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[apt.id]}
                      onChange={() => toggleSelect(apt.id)}
                      className="w-4 h-4 rounded accent-[var(--color-gold)]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {apt.profiles?.name || 'לקוח'}
                      </p>
                      <div className="flex gap-x-3 text-xs flex-wrap" style={{ color: 'var(--color-muted)' }}>
                        <span>{apt.services?.name}</span>
                        <span>{format(new Date(apt.start_at), 'dd/MM HH:mm', { locale: he })}</span>
                      </div>
                    </div>
                    <span className="font-bold text-sm" style={{ color: 'var(--color-gold)' }}>
                      {formatILS(apt.price || apt.services?.price || 0)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Generate button */}
          {appointments.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating || selectedCount === 0}
              className="btn-primary w-full py-3 text-base"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> מפיק...
                </span>
              ) : (
                `הפק ${selectedCount} חשבוניות`
              )}
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
