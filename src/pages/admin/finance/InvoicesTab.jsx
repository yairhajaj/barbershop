import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useInvoices } from '../../../hooks/useInvoices'
import { useBranch } from '../../../contexts/BranchContext'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatILS, calcVat, invoiceTitle, hasVat, docLabel } from '../../../lib/finance'
import { printInvoice } from '../../../lib/invoice'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale/he'

const STATUS_FILTERS = [
  { key: 'all',   label: 'הכל' },
  { key: 'draft', label: 'טיוטה' },
  { key: 'sent',  label: 'נשלחה' },
  { key: 'paid',  label: 'שולמה' },
]

const STATUS_STYLES = {
  draft: { color: '#6b7280', bg: 'var(--color-gray-tint)', border: 'var(--color-gray-ring)', label: 'טיוטה' },
  sent:  { color: '#2563eb', bg: 'var(--color-blue-tint)',   border: 'var(--color-blue-ring)',   label: 'נשלחה' },
  paid:  { color: '#16a34a', bg: 'var(--color-success-tint)',   border: 'var(--color-success-ring)',   label: 'שולמה' },
}

export function InvoicesTab() {
  const showToast = useToast()
  const { settings } = useBusinessSettings()
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [creditConfirmInv, setCreditConfirmInv] = useState(null)
  const [creditBusy, setCreditBusy] = useState(false)
  const [continuityIssues, setContinuityIssues] = useState(null)
  const [continuityLoading, setContinuityLoading] = useState(false)
  const { currentBranch } = useBranch()
  const { invoices, loading, createInvoice, markPaid, cancelInvoice, markSent } = useInvoices({
    status: filter === 'all' ? undefined : filter,
    branchId: currentBranch?.id ?? null,
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
          document_type: businessType === 'osek_patur' ? 400 : 305,
        })
        count++
      } catch (err) {
        showToast({ message: `שגיאה: ${err.message}`, type: 'error' })
      }
    }

    showToast({ message: `${count} ${docLabel(businessType, true)} הופקו בהצלחה`, type: 'success' })
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
      businessType,
      vatRate,
      invoiceNumber: inv.invoice_number,
      businessTaxId: settings?.business_tax_id,
      isCopy: !!inv.invoice_sent_at,
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

  async function handleCheckContinuity() {
    setContinuityLoading(true)
    try {
      const { data, error } = await supabase.rpc('check_invoice_continuity')
      if (error) throw error
      setContinuityIssues(data ?? [])
    } catch (err) {
      showToast({ message: 'שגיאה בבדיקת רציפות: ' + err.message, type: 'error' })
    } finally {
      setContinuityLoading(false)
    }
  }

  async function handleCreateCredit(inv) {
    setCreditBusy(true)
    try {
      const { creditNote } = await cancelInvoice(inv.id, 'זיכוי מהמערכת')
      showToast({
        message: creditNote
          ? `חשבונית זיכוי ${creditNote.invoice_number} הופקה ✓`
          : 'החשבונית (טיוטה) בוטלה',
        type: 'success',
      })
      setCreditConfirmInv(null)
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setCreditBusy(false)
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!inv.customer_name?.toLowerCase().includes(q) &&
          !inv.invoice_number?.toLowerCase().includes(q)) return false
    }
    if (dateFilter) {
      const invDate = (inv.service_date || inv.created_at || '').slice(0, 10)
      if (invDate !== dateFilter) return false
    }
    return true
  })

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

        <div className="flex gap-2">
          <button
            onClick={handleCheckContinuity}
            disabled={continuityLoading}
            className="px-3 py-2 text-sm rounded-xl font-medium transition-colors"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
            title="בדיקת רציפות מספרי חשבוניות (הוראות ניהול ספרים)"
          >
            {continuityLoading ? '...' : '🔍 רציפות'}
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="btn-primary px-4 py-2 text-sm"
          >
            + הפק {docLabel(businessType)}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute top-1/2 -translate-y-1/2 right-3 text-sm" style={{ color: 'var(--color-muted)' }}>🔍</span>
          <input
            className="w-full rounded-xl px-3 py-2 pr-9 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
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

      {/* Invoice list */}
      {loading ? (
        <AdminSkeleton />
      ) : filteredInvoices.length === 0 ? (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-5xl mb-4">🧾</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
            {searchQuery || dateFilter ? `לא נמצאו ${docLabel(businessType, true)}` : `אין ${docLabel(businessType, true)}`}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {searchQuery || dateFilter ? 'נסה חיפוש אחר' : `לחץ "הפק ${docLabel(businessType)}" כדי ליצור ${docLabel(businessType)} חדשה`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredInvoices.map((inv, i) => {
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
                      style={{ background: 'var(--color-success-tint)', border: '1px solid var(--color-success-ring)', color: '#16a34a' }}
                    >
                      ✅ שולמה
                    </button>
                  )}
                  {inv.credit_note_for ? (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                      זיכוי
                    </span>
                  ) : !inv.is_cancelled && (
                    <button
                      onClick={() => setCreditConfirmInv(inv)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
                    >
                      זיכוי
                    </button>
                  )}
                </div>
              </motion.div>
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
                חשבונית <strong>{creditConfirmInv.invoice_number}</strong> של {creditConfirmInv.customer_name} תסומן כמבוטלת,
                ותיפתח חשבונית זיכוי חדשה על סך {formatILS(creditConfirmInv.total_amount)}.
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>שתי הרשומות יישמרו במערכת לצורכי ביקורת.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCreateCredit(creditConfirmInv)}
                disabled={creditBusy}
                className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
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

      {/* Generate Invoice Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title={`הפקת ${docLabel(businessType, true)}`} size="lg">
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
                      background: selected[apt.id] ? 'var(--color-gold-tint)' : 'var(--color-surface)',
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
                `הפק ${selectedCount} ${docLabel(businessType, true)}`
              )}
            </button>
          )}
        </div>
      </Modal>

      {/* Continuity check results modal */}
      <Modal
        open={continuityIssues !== null}
        onClose={() => setContinuityIssues(null)}
        title="בדיקת רציפות מספרי חשבוניות"
      >
        {continuityIssues?.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>כל המספרים תקינים</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>לא נמצאו חריגות ברצף החשבוניות</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              נמצאו {continuityIssues?.length} חריגות — נדרש בירור לפי הוראות ניהול ספרים
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {(continuityIssues ?? []).map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    background: issue.issue === 'missing' ? 'var(--color-warning-tint, #fef9c3)' : 'var(--color-error-tint, #fee2e2)',
                    border: `1px solid ${issue.issue === 'missing' ? '#fcd34d' : '#fca5a5'}`,
                  }}
                >
                  <span>{issue.issue === 'missing' ? '⚠️' : '🔴'}</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {issue.issue === 'missing' ? 'מספר חסר' : 'כפול'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{issue.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
