import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useServices } from '../../../hooks/useServices'
import { useExpenses } from '../../../hooks/useExpenses'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { AdminSkeleton } from '../../../components/feedback/AdminSkeleton'

// ── Payment mode constants (migrated from Payments.jsx) ──

const GLOBAL_MODE_OPTS = [
  { value: 'disabled',    icon: '🚫', label: 'ללא תשלום באפליקציה', desc: 'לקוחות מזמינים ללא תשלום — ישלמו בעסק' },
  { value: 'optional',    icon: '🤝', label: 'אופציונלי',           desc: 'הלקוח יכול לשלם עכשיו או לשלם בעסק' },
  { value: 'required',    icon: '🔒', label: 'חובה לשלם',           desc: 'הלקוח חייב לשלם כדי לסיים הזמנה — מונע no-shows' },
  { value: 'per_service', icon: '✂️', label: 'לפי שירות',           desc: 'כל שירות קובע את מצב התשלום שלו בנפרד' },
]

const ENTITY_MODE_OPTS = [
  { value: 'inherit',  label: 'לפי הגדרות ראשיות' },
  { value: 'required', label: '🔒 חובה' },
  { value: 'optional', label: '🤝 אופציונלי' },
  { value: 'disabled', label: '🚫 ללא תשלום' },
]

const BUSINESS_TYPES = [
  { value: 'osek_morsheh', icon: '📋', label: 'עוסק מורשה', desc: 'חייב במע"מ, מנפיק חשבונית מס' },
  { value: 'osek_patur',   icon: '📝', label: 'עוסק פטור',   desc: 'פטור ממע"מ, מנפיק חשבונית עסקה' },
  { value: 'company',      icon: '🏢', label: 'חברה בע"מ',   desc: 'חייב במע"מ, מנפיק חשבונית מס' },
]

const COMMISSION_TYPES = [
  { value: 'percentage', label: 'אחוזים', desc: 'הספר מקבל אחוז מכל שירות' },
  { value: 'fixed',      label: 'סכום קבוע', desc: 'סכום קבוע לכל שירות' },
  { value: 'salary',     label: 'משכורת', desc: 'משכורת חודשית קבועה' },
]

const ICON_OPTIONS = ['📦', '🏠', '🚗', '✂️', '🧴', '💡', '📱', '🧹', '🍽️', '📊', '🎨', '🔧', '💼', '🏦', '📋', '🧾']

// ── ModePill — migrated from Payments.jsx ──

function ModePill({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {ENTITY_MODE_OPTS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
          style={{
            background: value === opt.value ? 'var(--color-gold)' : 'var(--color-surface)',
            color:      value === opt.value ? '#fff' : 'var(--color-muted)',
            border:     `1px solid ${value === opt.value ? 'var(--color-gold)' : 'var(--color-border)'}`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsTab() {
  const showToast = useToast()
  const { settings, saveSettings, loading: settingsLoading } = useBusinessSettings()
  const { services, loading: servicesLoading } = useServices()
  const { categories, createCategory, updateCategory } = useExpenses()

  // ── Local state ──
  const [saving, setSaving] = useState(false)

  // Section 1: Business type + VAT
  const [businessType, setBusinessType] = useState('osek_morsheh')
  const [vatRate, setVatRate] = useState(18)
  const [businessTaxId, setBusinessTaxId] = useState('')

  // Section 2: Invoice settings
  const [invoicePrefix, setInvoicePrefix] = useState('INV')
  const [invoiceNextNumber, setInvoiceNextNumber] = useState(1)
  const [invoiceFooterText, setInvoiceFooterText] = useState('')

  // Section 3: Payment mode
  const [paymentEnabled, setPaymentEnabled] = useState(false)
  const [globalMode, setGlobalMode] = useState('disabled')
  const [servicesModes, setServicesModes] = useState({})
  const [branchesModes, setBranchesModes] = useState({})
  const [branches, setBranches] = useState([])

  // Section 4: Commission
  const [commissionType, setCommissionType] = useState('percentage')
  const [commissionRate, setCommissionRate] = useState(50)

  // Section 5: Expense categories
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('📦')
  const [catSaving, setCatSaving] = useState(false)

  // Section 6: Accountant
  const [accountantName, setAccountantName] = useState('')
  const [accountantPhone, setAccountantPhone] = useState('')
  const [accountantEmail, setAccountantEmail] = useState('')

  // Section 7: Cash tracking
  const [cashTracking, setCashTracking] = useState(true)

  // ── Sync from settings ──
  useEffect(() => {
    if (!settings) return
    setBusinessType(settings.business_type || 'osek_morsheh')
    setVatRate(settings.vat_rate ?? 18)
    setBusinessTaxId(settings.business_tax_id || '')
    setInvoicePrefix(settings.invoice_prefix || 'INV')
    setInvoiceNextNumber(settings.invoice_next_number ?? 1)
    setInvoiceFooterText(settings.invoice_footer_text || '')
    setPaymentEnabled(settings.payment_enabled ?? false)
    setGlobalMode(settings.payment_mode || 'disabled')
    setCommissionType(settings.commission_type || 'percentage')
    setCommissionRate(settings.commission_default_rate ?? 50)
    setAccountantName(settings.accountant_name || '')
    setAccountantPhone(settings.accountant_phone || '')
    setAccountantEmail(settings.accountant_email || '')
    setCashTracking(settings.cash_tracking_enabled ?? true)
  }, [settings])

  // Sync services payment_mode
  useEffect(() => {
    const map = {}
    services.forEach(s => { map[s.id] = s.payment_mode ?? 'inherit' })
    setServicesModes(map)
  }, [services])

  // Load branches
  useEffect(() => {
    supabase.from('branches').select('id, name, payment_mode').eq('is_active', true).order('name').then(({ data }) => {
      const list = data ?? []
      setBranches(list)
      const map = {}
      list.forEach(b => { map[b.id] = b.payment_mode ?? 'inherit' })
      setBranchesModes(map)
    })
  }, [])

  // ── Save all settings ──
  async function handleSave() {
    setSaving(true)
    try {
      // 1. Save business settings
      await saveSettings({
        business_type: businessType,
        vat_rate: vatRate,
        business_tax_id: businessTaxId,
        invoice_prefix: invoicePrefix,
        invoice_footer_text: invoiceFooterText,
        payment_enabled: paymentEnabled,
        payment_mode: globalMode,
        commission_type: commissionType,
        commission_default_rate: commissionRate,
        accountant_name: accountantName,
        accountant_phone: accountantPhone,
        accountant_email: accountantEmail,
        cash_tracking_enabled: cashTracking,
      })

      // 2. Save per-service overrides
      const serviceUpdates = services.map(s =>
        supabase.from('services').update({ payment_mode: servicesModes[s.id] ?? 'inherit' }).eq('id', s.id)
      )

      // 3. Save per-branch overrides
      const branchUpdates = branches.map(b =>
        supabase.from('branches').update({ payment_mode: branchesModes[b.id] ?? 'inherit' }).eq('id', b.id)
      )

      await Promise.all([...serviceUpdates, ...branchUpdates])
      showToast({ message: 'ההגדרות נשמרו בהצלחה', type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ── Add expense category ──
  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setCatSaving(true)
    try {
      await createCategory({
        name: newCatName.trim(),
        icon: newCatIcon,
        is_active: true,
        display_order: categories.length,
      })
      setNewCatName('')
      setNewCatIcon('📦')
      setShowNewCategory(false)
      showToast({ message: 'קטגוריה נוספה', type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setCatSaving(false)
    }
  }

  async function toggleCategoryActive(cat) {
    try {
      await updateCategory(cat.id, { is_active: !cat.is_active })
      showToast({ message: cat.is_active ? 'קטגוריה הושבתה' : 'קטגוריה הופעלה', type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    }
  }

  if (settingsLoading) {
    return <AdminSkeleton />
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* ══════════ Section 1: Business Type + VAT ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          סוג עסק ומע"מ
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          בחר את סוג העסק לחישוב מע"מ וסוג חשבונית
        </p>

        <div className="space-y-2 mb-4">
          {BUSINESS_TYPES.map(bt => {
            const active = businessType === bt.value
            return (
              <button
                key={bt.value}
                type="button"
                onClick={() => setBusinessType(bt.value)}
                className="w-full flex items-start gap-3 p-3 rounded-xl text-right transition-all"
                style={{
                  background: active ? 'rgba(201,169,110,0.1)' : 'transparent',
                  border: `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center"
                  style={{ borderColor: active ? 'var(--color-gold)' : '#ccc' }}
                >
                  {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-gold)' }} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>{bt.icon}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{bt.label}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{bt.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              אחוז מע"מ
            </label>
            <input
              type="number"
              value={vatRate}
              onChange={e => setVatRate(Number(e.target.value))}
              disabled={businessType === 'osek_patur'}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                opacity: businessType === 'osek_patur' ? 0.5 : 1,
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              ח.פ / מספר עוסק
            </label>
            <input
              type="text"
              value={businessTaxId}
              onChange={e => setBusinessTaxId(e.target.value)}
              placeholder="e.g. 515555555"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* ══════════ Section 2: Invoice Settings ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          הגדרות חשבונית
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          קידומת, מספור וטקסט תחתון
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              קידומת חשבונית
            </label>
            <input
              type="text"
              value={invoicePrefix}
              onChange={e => setInvoicePrefix(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              מספר חשבונית הבא
            </label>
            <input
              type="text"
              value={invoiceNextNumber}
              readOnly
              className="w-full rounded-xl px-3 py-2.5 text-sm cursor-not-allowed"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-muted)',
                opacity: 0.7,
              }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
            טקסט תחתון בחשבונית
          </label>
          <textarea
            value={invoiceFooterText}
            onChange={e => setInvoiceFooterText(e.target.value)}
            rows={2}
            placeholder="תודה על בחירתך!"
            className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      </motion.div>

      {/* ══════════ Section 3: Payment Mode (migrated from Payments.jsx) ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          מצב תשלום
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          ברירת המחדל לכל ההזמנות — ניתן לדרוס לפי שירות או סניף
        </p>

        {/* Toggle: הפעל תשלום אונליין */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>הפעל תשלום אונליין</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              אפשר ללקוחות לשלם דרך האפליקציה
            </p>
          </div>
          <button
            onClick={() => setPaymentEnabled(!paymentEnabled)}
            className="w-12 h-7 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: paymentEnabled ? 'var(--color-gold)' : 'var(--color-border)' }}
          >
            <div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
              style={{ [paymentEnabled ? 'left' : 'right']: 2 }}
            />
          </button>
        </div>

        {/* OFF: neutral info message */}
        {!paymentEnabled ? (
          <div
            className="rounded-xl p-3 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ color: 'var(--color-muted)' }}>
              לקוחות יזמינו ללא תשלום באפליקציה. להפעלת תשלום, חבר סליקה בהגדרות ← הגדרות כלליות.
            </p>
          </div>
        ) : (
          /* ON: Global payment mode */
          <div className="space-y-2 mb-4">
            {GLOBAL_MODE_OPTS.map(opt => {
              const active = globalMode === opt.value
              const isBlocked = opt.value !== 'disabled' && (!settings?.payment_enabled || !settings?.grow_api_key)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (isBlocked) {
                      showToast({ message: 'יש לחבר סליקה (Grow) תחת הגדרות כלליות', type: 'error' })
                      return
                    }
                    setGlobalMode(opt.value)
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-xl text-right transition-all"
                  style={{
                    background: active ? 'rgba(201,169,110,0.1)' : 'transparent',
                    border: `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    opacity: isBlocked ? 0.5 : 1,
                    cursor: isBlocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ borderColor: active ? 'var(--color-gold)' : '#ccc' }}
                  >
                    {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-gold)' }} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span>{opt.icon}</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{opt.label}</span>
                      {isBlocked && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>דרוש API Key</span>}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{opt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Per-service overrides — only when per_service mode */}
        {paymentEnabled && globalMode === 'per_service' && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)' }}>הגדרה לפי שירות</p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              קבע מצב תשלום נפרד לכל שירות
            </p>
            {servicesLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : services.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: 'var(--color-muted)' }}>אין שירותים</p>
            ) : (
              <div className="space-y-3">
                {services.map(service => (
                  <div
                    key={service.id}
                    className="flex flex-col gap-2 p-3 rounded-xl"
                    style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{service.name}</span>
                      {service.price && (
                        <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>₪{service.price}</span>
                      )}
                    </div>
                    <ModePill
                      value={servicesModes[service.id] ?? 'inherit'}
                      onChange={val => setServicesModes(m => ({ ...m, [service.id]: val }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Per-branch overrides */}
        {paymentEnabled && branches.length > 0 && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)' }}>הגדרה לפי סניף</p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              קבע מצב תשלום שונה לכל סניף — מנצח את ההגדרה הגלובלית
            </p>
            <div className="space-y-3">
              {branches.map(branch => (
                <div
                  key={branch.id}
                  className="flex flex-col gap-2 p-3 rounded-xl"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                >
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>📍 {branch.name}</span>
                  <ModePill
                    value={branchesModes[branch.id] ?? 'inherit'}
                    onChange={val => setBranchesModes(m => ({ ...m, [branch.id]: val }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Priority legend — only when payment on */}
        {paymentEnabled && (
          <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.2)' }}>
            <p className="font-bold mb-1" style={{ color: 'var(--color-gold)' }}>סדר עדיפויות</p>
            <p style={{ color: 'var(--color-muted)' }}>
              <strong>שירות</strong> &gt; <strong>סניף</strong> &gt; <strong>גלובלי</strong> — הספציפי תמיד מנצח
            </p>
          </div>
        )}
      </motion.div>

      {/* ══════════ Section 4: Staff Commission ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          עמלות ספרים
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          הגדר את שיטת התגמול לספרים
        </p>

        <div className="space-y-2 mb-4">
          {COMMISSION_TYPES.map(ct => {
            const active = commissionType === ct.value
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => setCommissionType(ct.value)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-right transition-all"
                style={{
                  background: active ? 'rgba(201,169,110,0.1)' : 'transparent',
                  border: `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: active ? 'var(--color-gold)' : '#ccc' }}
                >
                  {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-gold)' }} />}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{ct.label}</span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{ct.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        {commissionType !== 'salary' && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              {commissionType === 'percentage' ? 'אחוז ברירת מחדל' : 'סכום קבוע ברירת מחדל (₪)'}
            </label>
            <input
              type="number"
              value={commissionRate}
              onChange={e => setCommissionRate(Number(e.target.value))}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        )}
      </motion.div>

      {/* ══════════ Section 5: Expense Categories ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          קטגוריות הוצאות
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          נהל את הקטגוריות לסיווג הוצאות
        </p>

        {categories.length === 0 ? (
          <p className="text-sm text-center py-3" style={{ color: 'var(--color-muted)' }}>
            אין קטגוריות — הוסף קטגוריה ראשונה
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon || '📦'}</span>
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: cat.is_active ? 'var(--color-text)' : 'var(--color-muted)',
                      textDecoration: cat.is_active ? 'none' : 'line-through',
                    }}
                  >
                    {cat.name}
                  </span>
                </div>
                <button
                  onClick={() => toggleCategoryActive(cat)}
                  className="w-10 h-6 rounded-full transition-colors relative"
                  style={{
                    background: cat.is_active ? 'var(--color-gold)' : 'var(--color-border)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ [cat.is_active ? 'left' : 'right']: 2 }}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add category inline */}
        {showNewCategory ? (
          <div
            className="rounded-xl p-3 space-y-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-gold)' }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="שם קטגוריה"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                autoFocus
              />
            </div>

            {/* Icon picker */}
            <div className="flex gap-1.5 flex-wrap">
              {ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewCatIcon(icon)}
                  className="min-w-11 min-h-11 rounded-lg flex items-center justify-center text-lg transition-all"
                  style={{
                    background: newCatIcon === icon ? 'var(--color-gold)' : 'var(--color-card)',
                    border: `1px solid ${newCatIcon === icon ? 'var(--color-gold)' : 'var(--color-border)'}`,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddCategory}
                disabled={catSaving || !newCatName.trim()}
                className="btn-primary px-4 py-2 text-sm"
              >
                {catSaving ? <Spinner size="sm" /> : 'שמור'}
              </button>
              <button
                onClick={() => { setShowNewCategory(false); setNewCatName(''); setNewCatIcon('📦') }}
                className="px-4 py-2 text-sm rounded-xl"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-muted)',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewCategory(true)}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
              color: 'var(--color-muted)',
            }}
          >
            + הוסף קטגוריה
          </button>
        )}
      </motion.div>

      {/* ══════════ Section 6: Accountant ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card p-5"
      >
        <h3
          className="font-bold text-base mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          רואה חשבון
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
          פרטי רואה החשבון לשליחת דוחות
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>שם</label>
            <input
              type="text"
              value={accountantName}
              onChange={e => setAccountantName(e.target.value)}
              placeholder="שם רואה החשבון"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              טלפון
              <span className="text-xs font-normal mr-1" style={{ color: 'var(--color-muted)' }}>
                (משמש גם לWhatsApp)
              </span>
            </label>
            <input
              type="tel"
              value={accountantPhone}
              onChange={e => setAccountantPhone(e.target.value)}
              placeholder="054-000-0000"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>אימייל</label>
            <input
              type="email"
              value={accountantEmail}
              onChange={e => setAccountantEmail(e.target.value)}
              placeholder="accountant@example.com"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* ══════════ Section 7: Cash Tracking ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className="font-bold text-base"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
            >
              מעקב מזומנים
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              מעקב אחרי תשלומי מזומן שהתקבלו בעסק
            </p>
          </div>
          <button
            onClick={() => setCashTracking(!cashTracking)}
            className="w-12 h-7 rounded-full transition-colors relative flex-shrink-0"
            style={{
              background: cashTracking ? 'var(--color-gold)' : 'var(--color-border)',
            }}
          >
            <div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
              style={{ [cashTracking ? 'left' : 'right']: 2 }}
            />
          </button>
        </div>
      </motion.div>

      {/* ══════════ Global Save Button ══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3 text-base"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" /> שומר...
            </span>
          ) : (
            'שמור הגדרות'
          )}
        </button>
      </motion.div>
    </div>
  )
}
